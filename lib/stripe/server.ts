import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import {
  type ActivityBooking,
  cancelActivityBookingsForOrder,
  createActivityBookingAfterPayment,
  listActivityBookings,
} from "@/lib/activity-bookings/service";
import { CART_LINE_TYPE_ACTIVITY } from "@/lib/cart/constants";
import { deleteAllCartLinesForUser } from "@/lib/cart/service";
import type { CartLine } from "@/lib/cart/types";
import {
  getOrderById,
  updateOrderPaidWithStripePaymentIntent,
  updateOrderStatus,
} from "@/lib/orders/service";
import type { Order } from "@/lib/orders/types";
import type { Database } from "@/supabase/types/database";

let stripeSingleton: Stripe | null = null;

/**
 * Server-only Stripe SDK instance (Checkout, refunds). Never import from client components.
 */
export function getStripe(): Stripe {
  if (!stripeSingleton) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

/**
 * Signing secret for `stripe.webhooks.constructEvent` on POST `/api/webhooks/stripe`.
 */
export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }
  return secret;
}

/**
 * Absolute site origin for Stripe Checkout `success_url` / `cancel_url` and similar redirects.
 * Mirrors signup: `NEXT_PUBLIC_SITE_URL`, else `NEXT_PUBLIC_VERCEL_URL` (https-prefixed if host-only), else local dev.
 */
export function getPublicSiteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    "http://localhost:3000";

  return url.startsWith("http") ? url : `https://${url}`;
}

/**
 * Verifies `Stripe-Signature` and returns the event. Caller must pass the **raw** request body
 * (this consumes `request` — do not call `json()` first).
 */
export async function parseAndVerifyStripeWebhook(
  request: Request,
): Promise<Stripe.Event> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    throw new Error("Missing stripe-signature header");
  }
  const rawBody = await request.text();
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    getStripeWebhookSecret(),
  );
}

export type CreateCheckoutSessionForOrderInput = {
  order: Order;
  /** Validated cart lines (MVP: activity lines only; must match `order` totals). */
  lines: CartLine[];
  /** Origin from {@link getPublicSiteUrl} or equivalent. */
  siteUrl: string;
};

/**
 * Creates a Stripe Checkout Session for an awaiting-payment order. Line item amounts use cart
 * snapshots so the sum matches `order.total_cents`.
 */
export async function createCheckoutSessionForOrder(
  input: CreateCheckoutSessionForOrderInput,
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const { order, lines, siteUrl } = input;
  const base = siteUrl.replace(/\/$/, "");

  const activityLines = lines.filter((l) => l.line_type === CART_LINE_TYPE_ACTIVITY);
  if (activityLines.length === 0) {
    throw new Error("Checkout requires at least one activity line");
  }

  let sumCents = 0;
  for (const line of activityLines) {
    sumCents += line.line_total_cents;
  }
  if (sumCents !== order.total_cents) {
    throw new Error("Cart line totals do not match order total");
  }

  const lineItems = activityLines.map((line) => {
    const participants = line.participants;
    if (participants == null || !Number.isInteger(participants) || participants < 1) {
      throw new Error("Invalid participants on cart line");
    }
    return {
      price_data: {
        currency: order.currency,
        product_data: {
          name: "Activity booking",
        },
        unit_amount: line.unit_price_cents,
      },
      quantity: participants,
    };
  });

  return getStripe().checkout.sessions.create({
    mode: "payment",
    currency: order.currency,
    line_items: lineItems,
    success_url: `${base}/?checkout=success&order_id=${encodeURIComponent(order.id)}`,
    cancel_url: `${base}/?checkout=cancelled`,
    metadata: {
      order_id: order.id,
    },
    client_reference_id: order.id,
  });
}

async function fetchCartLinesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CartLine[]> {
  const { data, error } = await supabase
    .from("cart_lines")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load cart lines: ${error.message}`);
  }
  return (data ?? []) as CartLine[];
}

async function fetchSlotsByIds(
  supabase: SupabaseClient<Database>,
  slotIds: string[],
): Promise<Map<string, Database["public"]["Tables"]["availability_slots"]["Row"]>> {
  if (slotIds.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("availability_slots")
    .select("*")
    .in("id", slotIds);

  if (error) {
    throw new Error(`Could not load availability slots: ${error.message}`);
  }
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function normalizeMoneyCurrency(value: string): string {
  return value.trim().toLowerCase();
}

async function insertStripeWebhookEvent(
  supabase: SupabaseClient<Database>,
  stripeEventId: string,
): Promise<void> {
  const { error } = await supabase.from("stripe_webhook_events").insert({
    stripe_event_id: stripeEventId,
  });
  if (error) {
    throw new Error(`Could not record Stripe webhook event: ${error.message}`);
  }
}

async function stripeWebhookEventExists(
  supabase: SupabaseClient<Database>,
  stripeEventId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .select("stripe_event_id")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check Stripe webhook idempotency: ${error.message}`);
  }
  return data != null;
}

function activityBookingsCoverCartLines(
  activityLines: CartLine[],
  bookings: { slot_id: string; order_id: string | null; status: string }[],
  orderId: string,
): boolean {
  if (activityLines.length === 0) {
    return false;
  }
  for (const line of activityLines) {
    const slotId = line.slot_id;
    if (!slotId) {
      return false;
    }
    const ok = bookings.some(
      (b) =>
        b.order_id === orderId &&
        b.slot_id === slotId &&
        b.status === "confirmed",
    );
    if (!ok) {
      return false;
    }
  }
  return true;
}

function paymentIntentIdFromSession(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (pi == null) {
    return null;
  }
  return typeof pi === "string" ? pi : pi.id;
}

export type FulfillCheckoutSessionCompletedResult =
  | { status: "duplicate_event" }
  | { status: "already_fulfilled" }
  | { status: "ignored"; reason: "event_type" | "mode" | "payment_status" }
  | { status: "success" }
  | { status: "order_not_found" }
  | { status: "amount_mismatch_marked_failed" }
  | { status: "partial_failure_marked_refunded" };

/**
 * Orchestrates **`checkout.session.completed`** fulfillment: idempotency, order/cart loading,
 * **`create_activity_booking_after_payment`** per activity line, cart clear, webhook dedupe row.
 * On partial RPC failure after at least one success: **`cancel_activity_bookings_for_order`**, Stripe
 * **refund**, order **`refunded`**. On amount/currency mismatch vs `orders`: order **`failed`**, refund
 * if a PaymentIntent is present.
 *
 * Call with a **service-role** Supabase client. Returns a structured result for the HTTP layer
 * (e.g. duplicate and success both map to **200**).
 */
export async function fulfillCheckoutSessionCompleted(
  event: Stripe.Event,
  supabase: SupabaseClient<Database>,
): Promise<FulfillCheckoutSessionCompletedResult> {
  if (event.type !== "checkout.session.completed") {
    return { status: "ignored", reason: "event_type" };
  }

  if (await stripeWebhookEventExists(supabase, event.id)) {
    return { status: "duplicate_event" };
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode !== "payment") {
    return { status: "ignored", reason: "mode" };
  }

  if (session.payment_status !== "paid") {
    return { status: "ignored", reason: "payment_status" };
  }

  const orderId = session.metadata?.order_id?.trim();
  if (!orderId) {
    throw new Error("checkout.session.completed missing metadata.order_id");
  }

  const order = await getOrderById(supabase, orderId);
  if (!order) {
    return { status: "order_not_found" };
  }

  const piId = paymentIntentIdFromSession(session);

  const activityLines = (await fetchCartLinesForUser(supabase, order.user_id)).filter(
    (l) => l.line_type === CART_LINE_TYPE_ACTIVITY,
  );

  let knownBookings: ActivityBooking[] = await listActivityBookings(supabase, {
    orderId: order.id,
    limit: 500,
  });

  if (
    order.status === "paid" &&
    activityBookingsCoverCartLines(activityLines, knownBookings, order.id)
  ) {
    await deleteAllCartLinesForUser(supabase, order.user_id);
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "already_fulfilled" };
  }

  const stripe = getStripe();

  const amountTotal = session.amount_total;
  const sessionCurrency = session.currency;

  if (
    amountTotal == null ||
    sessionCurrency == null ||
    amountTotal !== order.total_cents ||
    normalizeMoneyCurrency(sessionCurrency) !== normalizeMoneyCurrency(order.currency)
  ) {
    await updateOrderStatus(supabase, order.id, "failed");
    if (piId) {
      await stripe.refunds.create({ payment_intent: piId });
    }
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "amount_mismatch_marked_failed" };
  }

  if (
    order.stripe_checkout_session_id != null &&
    order.stripe_checkout_session_id !== session.id
  ) {
    await updateOrderStatus(supabase, order.id, "failed");
    if (piId) {
      await stripe.refunds.create({ payment_intent: piId });
    }
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "amount_mismatch_marked_failed" };
  }

  if (order.status === "awaiting_payment") {
    if (!piId) {
      throw new Error("checkout.session.completed missing payment_intent for paid session");
    }
    await updateOrderPaidWithStripePaymentIntent(supabase, order.id, piId);
  } else if (order.status === "paid" && piId && !order.stripe_payment_intent_id) {
    const { error } = await supabase
      .from("orders")
      .update({ stripe_payment_intent_id: piId })
      .eq("id", order.id);
    if (error) {
      throw new Error(`Could not persist payment intent on order: ${error.message}`);
    }
  } else if (order.status !== "paid") {
    throw new Error(`Order is not payable in current state: ${order.status}`);
  }

  const slotIds = [
    ...new Set(
      activityLines
        .map((l) => l.slot_id)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];
  const slotById = await fetchSlotsByIds(supabase, slotIds);

  try {
    for (const line of activityLines) {
      if (!line.slot_id || line.participants == null) {
        throw new Error("Invalid activity cart line");
      }

      const already = knownBookings.some(
        (b) =>
          b.order_id === order.id &&
          b.slot_id === line.slot_id &&
          b.status === "confirmed",
      );
      if (already) {
        continue;
      }

      const slot = slotById.get(line.slot_id);
      if (!slot) {
        throw new Error("Slot not found");
      }

      const booking = await createActivityBookingAfterPayment(supabase, {
        slot_id: line.slot_id,
        activity_id: slot.activity_id,
        user_id: order.user_id,
        vendor_id: slot.vendor_id,
        order_id: order.id,
        participants: line.participants,
        unit_price_cents: line.unit_price_cents,
        subtotal_cents: line.line_subtotal_cents,
        discount_cents: line.line_discount_cents,
        total_cents: line.line_total_cents,
      });
      knownBookings = [...knownBookings, booking];
    }
  } catch {
    await cancelActivityBookingsForOrder(supabase, order.id);
    if (piId) {
      await stripe.refunds.create({ payment_intent: piId });
    }
    await updateOrderStatus(supabase, order.id, "refunded");
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "partial_failure_marked_refunded" };
  }

  await deleteAllCartLinesForUser(supabase, order.user_id);
  await insertStripeWebhookEvent(supabase, event.id);
  return { status: "success" };
}
