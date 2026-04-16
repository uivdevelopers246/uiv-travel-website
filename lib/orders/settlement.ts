import type { SupabaseClient } from "@supabase/supabase-js";

import { listActivityBookings } from "@/lib/activity-bookings/service";
import { createSettlementPaymentIntentForOrder, getStripe } from "@/lib/stripe/server";
import type { Database } from "@/supabase/types/database";

import {
  attachFirstSettlementPaymentIntent,
  getOrderById,
} from "./service";
import {
  computeConfirmedSettlementTotalCents,
  orderBookingsFullyResolvedForSettlement,
} from "./settlement-utils";

/**
 * After vendor/expiry transitions: if every line is resolved and at least one is **`confirmed`**,
 * create the **first** off-session settlement **`PaymentIntent`** (M4-C). Idempotent when a PI
 * is already stored or the order is not **`awaiting_vendor_approval`**.
 */
export async function tryBeginSettlementChargeForOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  const order = await getOrderById(supabase, orderId);
  if (!order || order.status !== "awaiting_vendor_approval") {
    return;
  }
  if (order.stripe_payment_intent_id) {
    return;
  }

  const bookings = await listActivityBookings(supabase, {
    orderId,
    limit: 500,
  });
  if (!orderBookingsFullyResolvedForSettlement(bookings)) {
    return;
  }

  const confirmedTotal = computeConfirmedSettlementTotalCents(bookings);
  if (confirmedTotal <= 0) {
    return;
  }

  if (!order.stripe_customer_id || !order.stripe_setup_intent_id) {
    throw new Error(
      "Order is missing Stripe customer or setup intent for settlement",
    );
  }

  const pi = await createSettlementPaymentIntentForOrder({
    order,
    amountCents: confirmedTotal,
    idempotencyKey: `m4c-settlement-${orderId}-1`,
  });

  const attached = await attachFirstSettlementPaymentIntent(
    supabase,
    orderId,
    pi.id,
  );
  if (!attached) {
    await getStripe().paymentIntents.cancel(pi.id);
  }
}
