import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { listActivityBookings } from "@/lib/activity-bookings/service";
import { createSettlementPaymentIntentForOrder, getStripe } from "@/lib/stripe/server";
import type { Database } from "@/supabase/types/database";
import { safeSendOrderStatusEmailHook } from "@/lib/orders/status-email-hooks";

import {
  attachFirstSettlementPaymentIntent,
  attachSettlementRetryPaymentIntent,
  getOrderById,
  markOrderFailedAfterSettlementExhausted,
} from "./service";
import {
  buildSettlementIdempotencyKey,
  computeConfirmedSettlementTotalCents,
  orderBookingsFullyResolvedForSettlement,
} from "./settlement-utils";

const CANCELABLE_PAYMENT_INTENT_STATUSES: ReadonlySet<Stripe.PaymentIntent.Status> =
  new Set([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
  ]);

type StripeErrorWithPaymentIntent = {
  payment_intent?: Stripe.PaymentIntent | null;
  raw?: {
    payment_intent?: Stripe.PaymentIntent | null;
  } | null;
};

function getPaymentIntentFromStripeError(error: unknown): Stripe.PaymentIntent | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as StripeErrorWithPaymentIntent;
  const paymentIntent = candidate.payment_intent ?? candidate.raw?.payment_intent ?? null;

  if (!paymentIntent || typeof paymentIntent.id !== "string" || paymentIntent.id === "") {
    return null;
  }

  return paymentIntent;
}

async function handleImmediateSettlementFailure(
  supabase: SupabaseClient<Database>,
  order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>,
  amountCents: number,
  failedPaymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const attachedFirstAttempt = await attachFirstSettlementPaymentIntent(
    supabase,
    order.id,
    failedPaymentIntent.id,
  );

  if (!attachedFirstAttempt) {
    const freshOrder = await getOrderById(supabase, order.id);
    if (
      freshOrder &&
      freshOrder.stripe_payment_intent_id === failedPaymentIntent.id &&
      (freshOrder.status === "payment_pending" ||
        freshOrder.status === "paid" ||
        freshOrder.status === "failed")
    ) {
      return;
    }

    throw new Error("Could not attach immediate settlement failure PaymentIntent");
  }

  try {
    const retryPaymentIntent = await createSettlementPaymentIntentForOrder({
      order,
      amountCents,
      idempotencyKey: buildSettlementIdempotencyKey(
        order.id,
        order.stripe_setup_intent_id!,
        2,
      ),
    });
    const attachedRetryAttempt = await attachSettlementRetryPaymentIntent(supabase, {
      orderId: order.id,
      priorStripePaymentIntentId: failedPaymentIntent.id,
      newStripePaymentIntentId: retryPaymentIntent.id,
    });

    if (attachedRetryAttempt) {
      return;
    }

    const freshOrder = await getOrderById(supabase, order.id);
    if (
      freshOrder &&
      freshOrder.stripe_payment_intent_id === retryPaymentIntent.id &&
      (freshOrder.status === "payment_pending" ||
        freshOrder.status === "paid" ||
        freshOrder.status === "failed")
    ) {
      return;
    }

    const latestRetryPaymentIntent = await getStripe().paymentIntents.retrieve(
      retryPaymentIntent.id,
    );
    if (CANCELABLE_PAYMENT_INTENT_STATUSES.has(latestRetryPaymentIntent.status)) {
      await getStripe().paymentIntents.cancel(retryPaymentIntent.id);
    }
    throw new Error("Could not attach retry settlement PaymentIntent after immediate failure");
  } catch (error) {
    const retryFailurePaymentIntent = getPaymentIntentFromStripeError(error);
    if (!retryFailurePaymentIntent) {
      throw error;
    }

    const attachedRetryFailure = await attachSettlementRetryPaymentIntent(supabase, {
      orderId: order.id,
      priorStripePaymentIntentId: failedPaymentIntent.id,
      newStripePaymentIntentId: retryFailurePaymentIntent.id,
    });

    if (!attachedRetryFailure) {
      const freshOrder = await getOrderById(supabase, order.id);
      if (
        freshOrder &&
        freshOrder.stripe_payment_intent_id === retryFailurePaymentIntent.id &&
        (freshOrder.status === "payment_pending" ||
          freshOrder.status === "paid" ||
          freshOrder.status === "failed")
      ) {
        return;
      }

      throw new Error(
        "Could not attach immediate retry settlement failure PaymentIntent",
      );
    }

    const failedOrder = await markOrderFailedAfterSettlementExhausted(
      supabase,
      order.id,
      retryFailurePaymentIntent.id,
    );

    if (!failedOrder) {
      const freshOrder = await getOrderById(supabase, order.id);
      if (freshOrder?.status === "failed") {
        return;
      }

      throw new Error("Could not mark order failed after immediate retry failure");
    }

    await safeSendOrderStatusEmailHook(supabase, {
      orderId: order.id,
      event: "payment_failed",
    });
  }
}

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

  let pi: Stripe.PaymentIntent;
  try {
    pi = await createSettlementPaymentIntentForOrder({
      order,
      amountCents: confirmedTotal,
      idempotencyKey: buildSettlementIdempotencyKey(
        orderId,
        order.stripe_setup_intent_id,
        1,
      ),
    });
  } catch (error) {
    const failedPaymentIntent = getPaymentIntentFromStripeError(error);
    if (!failedPaymentIntent) {
      throw error;
    }

    await handleImmediateSettlementFailure(
      supabase,
      order,
      confirmedTotal,
      failedPaymentIntent,
    );
    return;
  }

  const attached = await attachFirstSettlementPaymentIntent(
    supabase,
    orderId,
    pi.id,
  );
  if (!attached) {
    const freshOrder = await getOrderById(supabase, orderId);
    if (
      freshOrder &&
      ((
        freshOrder.status === "paid" ||
        freshOrder.status === "payment_pending"
      ) &&
        freshOrder.stripe_payment_intent_id === pi.id)
    ) {
      return;
    }

    const stripe = getStripe();
    const latestPi = await stripe.paymentIntents.retrieve(pi.id);

    if (latestPi.status === "succeeded") {
      return;
    }

    if (!CANCELABLE_PAYMENT_INTENT_STATUSES.has(latestPi.status)) {
      return;
    }

    await stripe.paymentIntents.cancel(pi.id);
  }
}
