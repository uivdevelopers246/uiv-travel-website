import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import {
  type ActivityBooking,
  cancelActivityBookingsForOrder,
  confirmPendingActivityBookingsForOrder,
  createActivityBookingAfterPayment,
  listActivityBookings,
} from "@/lib/activity-bookings/service";
import { bookingPendingApprovalExpiresAtIso } from "@/lib/activity-bookings/sla";
import { CART_LINE_TYPE_ACTIVITY } from "@/lib/cart/constants";
import { deleteAllCartLinesForUser } from "@/lib/cart/service";
import type { CartLine } from "@/lib/cart/types";
import { STRIPE_METADATA_ORDER_ID_KEY } from "@/lib/orders/constants";
import {
  findOrderByStripeApprovalPaymentIntentId,
  getOrderById,
  revertOrderToAwaitingPaymentAfterSetupFailure,
  updateOrderAwaitingVendorApprovalFromSetup,
  updateOrderPaidAfterApprovalCapture,
  updateOrderStatus,
  updateOrderStatusPaymentPending,
} from "@/lib/orders/service";
import type { Order } from "@/lib/orders/types";
import type { Database } from "@/supabase/types/database";

let stripeSingleton: Stripe | null = null;

/**
 * Server-only Stripe SDK instance (Checkout, customers, intents). Never import from client components.
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

/** `metadata.purpose` on approval PaymentIntents (M4-C). */
export const STRIPE_METADATA_PURPOSE = "purpose";

/** Value for {@link STRIPE_METADATA_PURPOSE} on vendor-approval capture PaymentIntents. */
export const STRIPE_PURPOSE_BOOKING_APPROVAL = "booking_approval";

function stripeId(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : value.id;
}

/** Trims `metadata.order_id` (see {@link STRIPE_METADATA_ORDER_ID_KEY}) from Stripe objects. */
function metadataOrderId(meta: Stripe.Metadata | null | undefined): string | undefined {
  const raw = meta?.[STRIPE_METADATA_ORDER_ID_KEY];
  return typeof raw === "string" ? raw.trim() : undefined;
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

export type CreateCheckoutSetupSessionForOrderInput = {
  order: Order;
  lines: CartLine[];
  siteUrl: string;
};

/**
 * Ensures a Stripe Customer exists for the order and persists **`orders.stripe_customer_id`**.
 * Call from an authenticated API route (RLS allows the buyer to update their order).
 */
export async function ensureStripeCustomerForOrder(
  supabase: SupabaseClient<Database>,
  order: Order,
): Promise<string> {
  if (order.stripe_customer_id) {
    return order.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    metadata: {
      user_id: order.user_id,
      [STRIPE_METADATA_ORDER_ID_KEY]: order.id,
    },
  });

  const { data, error } = await supabase
    .from("orders")
    .update({ stripe_customer_id: customer.id })
    .eq("id", order.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not persist Stripe customer on order: ${error.message}`);
  }
  if (!data) {
    throw new Error("Order not found");
  }
  return customer.id;
}

/**
 * M4-C: Stripe Checkout **`mode: setup`** to collect and save a payment method for a later
 * off-session charge on vendor approval.
 */
export async function createCheckoutSetupSessionForOrder(
  input: CreateCheckoutSetupSessionForOrderInput & { stripeCustomerId: string },
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const { order, lines, siteUrl, stripeCustomerId } = input;
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

  const sessionMetadata: Record<string, string> = {
    [STRIPE_METADATA_ORDER_ID_KEY]: order.id,
    flow: "m4c_setup",
  };

  return getStripe().checkout.sessions.create({
    mode: "setup",
    currency: order.currency,
    customer: stripeCustomerId,
    success_url: `${base}/?checkout=setup_success&${STRIPE_METADATA_ORDER_ID_KEY}=${encodeURIComponent(order.id)}`,
    cancel_url: `${base}/?checkout=cancelled`,
    metadata: sessionMetadata,
    /** Ensures `setup_intent.succeeded` carries the same `metadata.order_id` as the Checkout Session. */
    setup_intent_data: {
      metadata: sessionMetadata,
    },
    client_reference_id: order.id,
  });
}

/**
 * Optional M4-C path: embedded SetupIntent (e.g. Elements) instead of hosted Checkout setup.
 * Returns the client secret for the client and the SetupIntent id to store on the order if needed.
 */
export async function createSetupIntentForOrder(input: {
  order: Order;
  stripeCustomerId: string;
}): Promise<{ setupIntentId: string; clientSecret: string | null }> {
  const stripe = getStripe();
  const si = await stripe.setupIntents.create({
    customer: input.stripeCustomerId,
    usage: "off_session",
    metadata: {
      [STRIPE_METADATA_ORDER_ID_KEY]: input.order.id,
      flow: "m4c_setup",
    },
  });
  return {
    setupIntentId: si.id,
    clientSecret: si.client_secret,
  };
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

function activityBookingsCoverCartLinesForSetupHold(
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
        (b.status === "pending_approval" || b.status === "confirmed"),
    );
    if (!ok) {
      return false;
    }
  }
  return true;
}

function setupIntentIdFromSession(session: Stripe.Checkout.Session): string | null {
  const si = session.setup_intent;
  if (si == null) {
    return null;
  }
  return typeof si === "string" ? si : si.id;
}

export type FulfillCheckoutSetupSessionCompletedResult =
  | { status: "duplicate_event" }
  | { status: "already_fulfilled" }
  | { status: "success" }
  | { status: "order_not_found" }
  | { status: "session_mismatch_marked_failed" }
  | { status: "partial_failure_rolled_back" }
  | { status: "ignored"; reason: "mode_not_setup" };

export type FulfillSetupIntentSucceededResult = FulfillCheckoutSetupSessionCompletedResult;

export type FulfillPaymentIntentSucceededResult =
  | { status: "duplicate_event" }
  | { status: "already_fulfilled" }
  | { status: "ignored"; reason: "metadata" | "not_approval_intent" }
  | { status: "success" };

export type FulfillPaymentIntentPaymentFailedResult =
  | { status: "duplicate_event" }
  | { status: "ignored"; reason: "metadata" }
  | { status: "success" };

type M4cSetupFulfillmentCoreResult =
  | { status: "success" }
  | { status: "already_fulfilled" }
  | { status: "order_not_found" }
  | { status: "session_mismatch_marked_failed" }
  | { status: "partial_failure_rolled_back" };

async function fulfillM4cVendorApprovalRequestAfterSetupSaved(
  supabase: SupabaseClient<Database>,
  eventId: string,
  ctx: {
    orderId: string;
    stripeCustomerId: string;
    setupIntentId: string;
    checkoutSessionId: string | null;
  },
): Promise<M4cSetupFulfillmentCoreResult> {
  let order = await getOrderById(supabase, ctx.orderId);
  if (!order) {
    return { status: "order_not_found" };
  }

  if (
    ctx.checkoutSessionId != null &&
    order.stripe_checkout_session_id != null &&
    order.stripe_checkout_session_id !== ctx.checkoutSessionId
  ) {
    await updateOrderStatus(supabase, order.id, "failed");
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "session_mismatch_marked_failed" };
  }

  const activityLines = (await fetchCartLinesForUser(supabase, order.user_id)).filter(
    (l) => l.line_type === CART_LINE_TYPE_ACTIVITY,
  );

  let knownBookings: ActivityBooking[] = await listActivityBookings(supabase, {
    orderId: order.id,
    limit: 500,
  });

  if (order.status === "paid") {
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "already_fulfilled" };
  }

  if (order.status !== "awaiting_payment" && order.status !== "awaiting_vendor_approval") {
    await insertStripeWebhookEvent(supabase, eventId);
    throw new Error(`Order is not eligible for setup fulfillment: ${order.status}`);
  }

  if (order.status === "awaiting_vendor_approval") {
    if (activityBookingsCoverCartLinesForSetupHold(activityLines, knownBookings, order.id)) {
      await deleteAllCartLinesForUser(supabase, order.user_id);
      await insertStripeWebhookEvent(supabase, eventId);
      return { status: "already_fulfilled" };
    }
  } else if (order.status === "awaiting_payment") {
    const transitioned = await updateOrderAwaitingVendorApprovalFromSetup(supabase, {
      orderId: order.id,
      stripeCustomerId: ctx.stripeCustomerId,
      stripeSetupIntentId: ctx.setupIntentId,
    });

    if (!transitioned) {
      const fresh = await getOrderById(supabase, ctx.orderId);
      if (!fresh) {
        return { status: "order_not_found" };
      }
      order = fresh;
      knownBookings = await listActivityBookings(supabase, {
        orderId: order.id,
        limit: 500,
      });
      if (order.status === "awaiting_vendor_approval") {
        if (activityBookingsCoverCartLinesForSetupHold(activityLines, knownBookings, order.id)) {
          await deleteAllCartLinesForUser(supabase, order.user_id);
          await insertStripeWebhookEvent(supabase, eventId);
          return { status: "already_fulfilled" };
        }
      } else {
        await insertStripeWebhookEvent(supabase, eventId);
        return { status: "already_fulfilled" };
      }
    }
  }

  const slotIds = [
    ...new Set(
      activityLines
        .map((l) => l.slot_id)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];
  const slotById = await fetchSlotsByIds(supabase, slotIds);
  const expiresAt = bookingPendingApprovalExpiresAtIso();

  try {
    for (const line of activityLines) {
      if (!line.slot_id || line.participants == null) {
        throw new Error("Invalid activity cart line");
      }

      const already = knownBookings.some(
        (b) =>
          b.order_id === order.id &&
          b.slot_id === line.slot_id &&
          (b.status === "pending_approval" || b.status === "confirmed"),
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
        status: "pending_approval",
        expires_at: expiresAt,
      });
      knownBookings = [...knownBookings, booking];
    }
  } catch {
    await cancelActivityBookingsForOrder(supabase, order.id);
    await revertOrderToAwaitingPaymentAfterSetupFailure(supabase, order.id);
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "partial_failure_rolled_back" };
  }

  await deleteAllCartLinesForUser(supabase, order.user_id);
  await insertStripeWebhookEvent(supabase, eventId);
  return { status: "success" };
}

/**
 * M4-C: **`checkout.session.completed`** with **`mode: setup`** — pending_approval bookings,
 * **`awaiting_vendor_approval`**, cart clear. Idempotent via **`stripe_webhook_events`**.
 */
export async function fulfillCheckoutSetupSessionCompleted(
  event: Stripe.Event,
  supabase: SupabaseClient<Database>,
): Promise<FulfillCheckoutSetupSessionCompletedResult> {
  if (event.type !== "checkout.session.completed") {
    throw new Error("fulfillCheckoutSetupSessionCompleted expects checkout.session.completed");
  }

  if (await stripeWebhookEventExists(supabase, event.id)) {
    return { status: "duplicate_event" };
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "setup") {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "mode_not_setup" };
  }

  const orderId = metadataOrderId(session.metadata);
  if (!orderId) {
    throw new Error(
      `checkout.session.completed (setup) missing metadata.${STRIPE_METADATA_ORDER_ID_KEY}`,
    );
  }

  const setupIntentId = setupIntentIdFromSession(session);
  if (!setupIntentId) {
    throw new Error("checkout.session.completed (setup) missing setup_intent");
  }

  const customerId = stripeId(session.customer);
  if (!customerId) {
    throw new Error("checkout.session.completed (setup) missing customer");
  }

  return fulfillM4cVendorApprovalRequestAfterSetupSaved(supabase, event.id, {
    orderId,
    stripeCustomerId: customerId,
    setupIntentId,
    checkoutSessionId: session.id,
  });
}

/**
 * M4-C: embedded **`setup_intent.succeeded`** (and duplicate of Checkout setup in some flows).
 * Same DB outcome as {@link fulfillCheckoutSetupSessionCompleted}, separate Stripe event id.
 */
export async function fulfillSetupIntentSucceeded(
  event: Stripe.Event,
  supabase: SupabaseClient<Database>,
): Promise<FulfillSetupIntentSucceededResult> {
  if (event.type !== "setup_intent.succeeded") {
    throw new Error("fulfillSetupIntentSucceeded expects setup_intent.succeeded");
  }

  if (await stripeWebhookEventExists(supabase, event.id)) {
    return { status: "duplicate_event" };
  }

  const si = event.data.object as Stripe.SetupIntent;
  const orderId = metadataOrderId(si.metadata);
  if (!orderId) {
    throw new Error(`setup_intent.succeeded missing metadata.${STRIPE_METADATA_ORDER_ID_KEY}`);
  }

  const customerId = stripeId(si.customer);
  if (!customerId) {
    throw new Error("setup_intent.succeeded missing customer");
  }

  return fulfillM4cVendorApprovalRequestAfterSetupSaved(supabase, event.id, {
    orderId,
    stripeCustomerId: customerId,
    setupIntentId: si.id,
    checkoutSessionId: null,
  });
}

/**
 * M4-C: vendor-approval capture — **`payment_intent.succeeded`** with
 * **`metadata.purpose=booking_approval`** (or match on **`stripe_approval_payment_intent_id`**).
 */
export async function fulfillApprovalPaymentIntentSucceeded(
  event: Stripe.Event,
  supabase: SupabaseClient<Database>,
): Promise<FulfillPaymentIntentSucceededResult> {
  if (event.type !== "payment_intent.succeeded") {
    return { status: "ignored", reason: "not_approval_intent" };
  }

  if (await stripeWebhookEventExists(supabase, event.id)) {
    return { status: "duplicate_event" };
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const purpose = pi.metadata?.[STRIPE_METADATA_PURPOSE]?.trim();
  const metaOrderId = metadataOrderId(pi.metadata) ?? "";

  let order: Order | null =
    purpose === STRIPE_PURPOSE_BOOKING_APPROVAL && metaOrderId !== ""
      ? await getOrderById(supabase, metaOrderId)
      : null;

  if (!order && typeof pi.id === "string") {
    order = await findOrderByStripeApprovalPaymentIntentId(supabase, pi.id);
  }

  if (!order) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "metadata" };
  }

  if (purpose === STRIPE_PURPOSE_BOOKING_APPROVAL && metaOrderId !== "" && metaOrderId !== order.id) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "metadata" };
  }

  if (order.status === "paid" && order.stripe_payment_intent_id === pi.id) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "already_fulfilled" };
  }

  await confirmPendingActivityBookingsForOrder(supabase, order.id);
  await updateOrderPaidAfterApprovalCapture(supabase, order.id, pi.id);

  await insertStripeWebhookEvent(supabase, event.id);
  return { status: "success" };
}

/**
 * M4-C: approval capture failed — move order to **`payment_pending`** for retry / ops follow-up.
 */
export async function fulfillApprovalPaymentIntentFailed(
  event: Stripe.Event,
  supabase: SupabaseClient<Database>,
): Promise<FulfillPaymentIntentPaymentFailedResult> {
  if (event.type !== "payment_intent.payment_failed") {
    return { status: "ignored", reason: "metadata" };
  }

  if (await stripeWebhookEventExists(supabase, event.id)) {
    return { status: "duplicate_event" };
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const purpose = pi.metadata?.[STRIPE_METADATA_PURPOSE]?.trim();
  const metaOrderId = metadataOrderId(pi.metadata) ?? "";

  let order: Order | null =
    purpose === STRIPE_PURPOSE_BOOKING_APPROVAL && metaOrderId !== ""
      ? await getOrderById(supabase, metaOrderId)
      : null;

  if (!order && typeof pi.id === "string") {
    order = await findOrderByStripeApprovalPaymentIntentId(supabase, pi.id);
  }

  if (!order) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "metadata" };
  }

  await updateOrderStatusPaymentPending(supabase, order.id);
  await insertStripeWebhookEvent(supabase, event.id);
  return { status: "success" };
}
