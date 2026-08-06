import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import {
  type AccommodationBooking,
  cancelAccommodationBookingsForOrder,
  createAccommodationBookingAfterSetup,
  listAccommodationBookings,
} from "@/lib/accommodation-bookings/service";
import {
  type ActivityBooking,
  cancelActivityBookingsForOrder,
  createActivityBookingAfterPayment,
  listActivityBookings,
  reopenConfirmedActivityBookingsForOrder,
} from "@/lib/activity-bookings/service";
import { bookingPendingApprovalExpiresAtIso } from "@/lib/activity-bookings/sla";
import {
  CART_LINE_TYPE_ACTIVITY,
  CART_LINE_TYPE_ACCOMMODATION,
} from "@/lib/cart/constants";
import { deleteAllCartLinesForUser } from "@/lib/cart/service";
import type { CartLine } from "@/lib/cart/types";
import {
  STRIPE_METADATA_FLOW_M4C_PAYMENT_RECOVERY,
  STRIPE_METADATA_FLOW_M4C_SETUP,
  STRIPE_METADATA_FLOW_M4C_SETTLEMENT,
  STRIPE_METADATA_ORDER_ID_KEY,
} from "@/lib/orders/constants";
import { safeSendProviderBookingPendingNotice } from "@/lib/notifications/provider-notices";
import {
  buildSettlementIdempotencyKey,
  computeConfirmedSettlementTotalCents,
} from "@/lib/orders/settlement-utils";
import { listOrderBookingLinesForM4c } from "@/lib/orders/order-booking-lines";
import {
  attachSettlementRetryPaymentIntent,
  getOrderById,
  markOrderFailedAfterSettlementExhausted,
  markOrderReconciliationRequiredAfterSettlementMismatch,
  requeueFailedOrderForVendorApproval,
  revertOrderToAwaitingPaymentAfterSetupFailure,
  updateOrderAwaitingVendorApprovalFromSetup,
  updateOrderPaidAfterSettlementCapture,
  updateOrderStatus,
} from "@/lib/orders/service";
import { safeSendOrderStatusEmailHook } from "@/lib/orders/status-email-hooks";
import type { Order, OrderPaymentSummary } from "@/lib/orders/types";
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

function metadataFlow(meta: Stripe.Metadata | null | undefined): string | undefined {
  const raw = meta?.flow;
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
 * single settlement charge (after all order lines are approved/declined/expired).
 */
export async function createCheckoutSetupSessionForOrder(
  input: CreateCheckoutSetupSessionForOrderInput & { stripeCustomerId: string },
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const { order, lines, siteUrl, stripeCustomerId } = input;
  const base = siteUrl.replace(/\/$/, "");

  if (lines.length === 0) {
    throw new Error("Checkout requires at least one cart line");
  }

  let sumCents = 0;
  for (const line of lines) {
    sumCents += line.line_total_cents;
  }
  if (sumCents !== order.total_cents) {
    throw new Error("Cart line totals do not match order total");
  }

  const sessionMetadata: Record<string, string> = {
    [STRIPE_METADATA_ORDER_ID_KEY]: order.id,
    flow: STRIPE_METADATA_FLOW_M4C_SETUP,
  };

  return getStripe().checkout.sessions.create({
    mode: "setup",
    currency: order.currency,
    customer: stripeCustomerId,
    success_url: `${base}/checkout/success?order_id=${encodeURIComponent(order.id)}`,
    cancel_url: `${base}/checkout/cancel?order_id=${encodeURIComponent(order.id)}`,
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
      flow: STRIPE_METADATA_FLOW_M4C_SETUP,
    },
  });
  return {
    setupIntentId: si.id,
    clientSecret: si.client_secret,
  };
}

export async function createPaymentMethodUpdateSessionForOrder(input: {
  order: Order;
  siteUrl: string;
  stripeCustomerId: string;
}): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const base = input.siteUrl.replace(/\/$/, "");
  const sessionMetadata: Record<string, string> = {
    [STRIPE_METADATA_ORDER_ID_KEY]: input.order.id,
    flow: STRIPE_METADATA_FLOW_M4C_PAYMENT_RECOVERY,
  };

  return getStripe().checkout.sessions.create({
    mode: "setup",
    currency: input.order.currency,
    customer: input.stripeCustomerId,
    success_url: `${base}/my-trip/bookings?payment_recovery=updated`,
    cancel_url: `${base}/my-trip/bookings?payment_recovery=cancelled`,
    metadata: sessionMetadata,
    setup_intent_data: {
      metadata: sessionMetadata,
    },
    client_reference_id: input.order.id,
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

async function fetchAccommodationVendorIdsByIds(
  supabase: SupabaseClient<Database>,
  accommodationIds: string[],
): Promise<Map<string, string>> {
  if (accommodationIds.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("accommodations")
    .select("id, vendor_id")
    .in("id", accommodationIds);

  if (error) {
    throw new Error(`Could not load accommodations: ${error.message}`);
  }
  return new Map((data ?? []).map((row) => [row.id, row.vendor_id]));
}

async function insertStripeWebhookEvent(
  supabase: SupabaseClient<Database>,
  stripeEventId: string,
): Promise<void> {
  const { error } = await supabase.from("stripe_webhook_events").insert({
    stripe_event_id: stripeEventId,
  });
  if (error && !isDuplicateStripeWebhookEventInsert(error)) {
    throw new Error(`Could not record Stripe webhook event: ${error.message}`);
  }
}

function isDuplicateStripeWebhookEventInsert(error: { code?: string | null }): boolean {
  // Postgres unique_violation. Treat as idempotent success for webhook event recording.
  return error.code === "23505";
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

function accommodationBookingsCoverCartLinesForSetupHold(
  accommodationLines: CartLine[],
  bookings: {
    accommodation_id: string;
    check_in: string;
    check_out: string;
    order_id: string | null;
    status: string;
  }[],
  orderId: string,
): boolean {
  if (accommodationLines.length === 0) {
    return false;
  }
  for (const line of accommodationLines) {
    const accommodationId = line.accommodation_id;
    if (!accommodationId || !line.check_in || !line.check_out) {
      return false;
    }
    const ok = bookings.some(
      (b) =>
        b.order_id === orderId &&
        b.accommodation_id === accommodationId &&
        b.check_in === line.check_in &&
        b.check_out === line.check_out &&
        (b.status === "pending_approval" || b.status === "confirmed"),
    );
    if (!ok) {
      return false;
    }
  }
  return true;
}

function cartLinesCoveredBySetupHolds(
  activityLines: CartLine[],
  accommodationLines: CartLine[],
  activityBookings: ActivityBooking[],
  accommodationBookings: AccommodationBooking[],
  orderId: string,
): boolean {
  if (activityLines.length === 0 && accommodationLines.length === 0) {
    return false;
  }
  if (
    activityLines.length > 0 &&
    !activityBookingsCoverCartLinesForSetupHold(activityLines, activityBookings, orderId)
  ) {
    return false;
  }
  if (
    accommodationLines.length > 0 &&
    !accommodationBookingsCoverCartLinesForSetupHold(
      accommodationLines,
      accommodationBookings,
      orderId,
    )
  ) {
    return false;
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
  | {
      status: "ignored";
      reason:
        | "mode_not_setup"
        | "missing_order_id"
        | "missing_setup_intent"
        | "missing_customer"
        | "order_not_eligible"
        | "unsupported_flow"
        | "order_not_recoverable";
    };

export type FulfillSetupIntentSucceededResult = FulfillCheckoutSetupSessionCompletedResult;

type M4cSetupFulfillmentCoreResult =
  | { status: "success" }
  | { status: "already_fulfilled" }
  | { status: "order_not_found" }
  | { status: "session_mismatch_marked_failed" }
  | { status: "partial_failure_rolled_back" }
  | { status: "ignored"; reason: "order_not_eligible" };

type SetupFulfillmentContext = {
  orderId: string;
  stripeCustomerId: string;
  setupIntentId: string;
  checkoutSessionId: string | null;
};

async function fulfillM4cVendorApprovalRequestAfterSetupSaved(
  supabase: SupabaseClient<Database>,
  eventId: string,
  ctx: SetupFulfillmentContext,
): Promise<M4cSetupFulfillmentCoreResult> {
  let order = await getOrderById(supabase, ctx.orderId);
  if (!order) {
    await insertStripeWebhookEvent(supabase, eventId);
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

  const cartLines = await fetchCartLinesForUser(supabase, order.user_id);
  const activityLines = cartLines.filter((l) => l.line_type === CART_LINE_TYPE_ACTIVITY);
  const accommodationLines = cartLines.filter(
    (l) => l.line_type === CART_LINE_TYPE_ACCOMMODATION,
  );

  let knownActivityBookings: ActivityBooking[] = await listActivityBookings(supabase, {
    orderId: order.id,
    limit: 500,
  });
  let knownAccommodationBookings: AccommodationBooking[] =
    await listAccommodationBookings(supabase, {
      orderId: order.id,
      limit: 500,
    });

  if (order.status === "paid") {
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "already_fulfilled" };
  }

  if (order.status !== "awaiting_payment" && order.status !== "awaiting_vendor_approval") {
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "ignored", reason: "order_not_eligible" };
  }

  if (order.status === "awaiting_vendor_approval") {
    if (
      cartLinesCoveredBySetupHolds(
        activityLines,
        accommodationLines,
        knownActivityBookings,
        knownAccommodationBookings,
        order.id,
      )
    ) {
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
        await insertStripeWebhookEvent(supabase, eventId);
        return { status: "order_not_found" };
      }
      order = fresh;
      knownActivityBookings = await listActivityBookings(supabase, {
        orderId: order.id,
        limit: 500,
      });
      knownAccommodationBookings = await listAccommodationBookings(supabase, {
        orderId: order.id,
        limit: 500,
      });
      if (order.status === "awaiting_vendor_approval") {
        if (
          cartLinesCoveredBySetupHolds(
            activityLines,
            accommodationLines,
            knownActivityBookings,
            knownAccommodationBookings,
            order.id,
          )
        ) {
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

  const accommodationIds = [
    ...new Set(
      accommodationLines
        .map((l) => l.accommodation_id)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];
  const vendorIdByAccommodationId = await fetchAccommodationVendorIdsByIds(
    supabase,
    accommodationIds,
  );
  const expiresAt = bookingPendingApprovalExpiresAtIso();

  try {
    for (const line of activityLines) {
      if (!line.slot_id || line.participants == null) {
        throw new Error("Invalid activity cart line");
      }

      const already = knownActivityBookings.some(
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
      knownActivityBookings = [...knownActivityBookings, booking];
      await safeSendProviderBookingPendingNotice(supabase, booking.id);
    }

    for (const line of accommodationLines) {
      if (
        !line.accommodation_id ||
        !line.check_in ||
        !line.check_out ||
        line.guests == null
      ) {
        throw new Error("Invalid accommodation cart line");
      }

      const already = knownAccommodationBookings.some(
        (b) =>
          b.order_id === order.id &&
          b.accommodation_id === line.accommodation_id &&
          b.check_in === line.check_in &&
          b.check_out === line.check_out &&
          (b.status === "pending_approval" || b.status === "confirmed"),
      );
      if (already) {
        continue;
      }

      const vendorId = vendorIdByAccommodationId.get(line.accommodation_id);
      if (!vendorId) {
        throw new Error("Accommodation not found");
      }

      const booking = await createAccommodationBookingAfterSetup(supabase, {
        accommodation_id: line.accommodation_id,
        user_id: order.user_id,
        vendor_id: vendorId,
        order_id: order.id,
        check_in: line.check_in,
        check_out: line.check_out,
        guests: line.guests,
        unit_price_cents: line.unit_price_cents,
        subtotal_cents: line.line_subtotal_cents,
        discount_cents: line.line_discount_cents,
        total_cents: line.line_total_cents,
        status: "pending_approval",
        expires_at: expiresAt,
      });
      knownAccommodationBookings = [...knownAccommodationBookings, booking];
      await safeSendProviderBookingPendingNotice(
        supabase,
        booking.id,
        "accommodation",
      );
    }
  } catch {
    await cancelActivityBookingsForOrder(supabase, order.id);
    await cancelAccommodationBookingsForOrder(supabase, order.id);
    await revertOrderToAwaitingPaymentAfterSetupFailure(supabase, order.id);
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "partial_failure_rolled_back" };
  }

  await deleteAllCartLinesForUser(supabase, order.user_id);
  await insertStripeWebhookEvent(supabase, eventId);
  return { status: "success" };
}

async function fulfillM4cSettlementRecoveryAfterSetupSaved(
  supabase: SupabaseClient<Database>,
  eventId: string,
  ctx: SetupFulfillmentContext,
): Promise<FulfillCheckoutSetupSessionCompletedResult> {
  const order = await getOrderById(supabase, ctx.orderId);
  if (!order) {
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "order_not_found" };
  }

  if (
    order.status === "awaiting_vendor_approval" &&
    order.stripe_setup_intent_id === ctx.setupIntentId
  ) {
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "already_fulfilled" };
  }

  if (order.status === "paid" || order.status === "payment_pending") {
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "already_fulfilled" };
  }

  if (order.status !== "failed" || order.settlement_charge_attempt_count !== 2) {
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "ignored", reason: "order_not_recoverable" };
  }

  const bookings = await listActivityBookings(supabase, {
    orderId: order.id,
    limit: 500,
  });
  const confirmedBookings = bookings.filter((booking) => booking.status === "confirmed");
  const pendingApprovalBookings = bookings.filter(
    (booking) => booking.status === "pending_approval",
  );

  if (confirmedBookings.length === 0 && pendingApprovalBookings.length === 0) {
    await insertStripeWebhookEvent(supabase, eventId);
    return { status: "ignored", reason: "order_not_recoverable" };
  }

  if (confirmedBookings.length > 0) {
    await reopenConfirmedActivityBookingsForOrder(
      supabase,
      order.id,
      bookingPendingApprovalExpiresAtIso(),
    );
  }

  const requeued = await requeueFailedOrderForVendorApproval(supabase, {
    orderId: order.id,
    stripeCustomerId: ctx.stripeCustomerId,
    stripeSetupIntentId: ctx.setupIntentId,
  });

  if (!requeued) {
    const fresh = await getOrderById(supabase, order.id);
    await insertStripeWebhookEvent(supabase, eventId);
    if (
      fresh?.status === "awaiting_vendor_approval" &&
      fresh.stripe_setup_intent_id === ctx.setupIntentId
    ) {
      return { status: "already_fulfilled" };
    }
    return { status: "ignored", reason: "order_not_recoverable" };
  }

  await insertStripeWebhookEvent(supabase, eventId);
  return { status: "success" };
}

/**
 * M4-C / M4-D: **`checkout.session.completed`** with **`mode: setup`** — pending_approval
 * activity and accommodation bookings, **`awaiting_vendor_approval`**, cart clear.
 * Idempotent via **`stripe_webhook_events`**.
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
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "missing_order_id" };
  }

  const setupIntentId = setupIntentIdFromSession(session);
  if (!setupIntentId) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "missing_setup_intent" };
  }

  const customerId = stripeId(session.customer);
  if (!customerId) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "missing_customer" };
  }

  const ctx: SetupFulfillmentContext = {
    orderId,
    stripeCustomerId: customerId,
    setupIntentId,
    checkoutSessionId: session.id,
  };
  const flow = metadataFlow(session.metadata);
  if (flow === STRIPE_METADATA_FLOW_M4C_SETUP) {
    return fulfillM4cVendorApprovalRequestAfterSetupSaved(supabase, event.id, ctx);
  }
  if (flow === STRIPE_METADATA_FLOW_M4C_PAYMENT_RECOVERY) {
    return fulfillM4cSettlementRecoveryAfterSetupSaved(supabase, event.id, ctx);
  }

  await insertStripeWebhookEvent(supabase, event.id);
  return { status: "ignored", reason: "unsupported_flow" };
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
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "missing_order_id" };
  }

  const customerId = stripeId(si.customer);
  if (!customerId) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "missing_customer" };
  }

  const ctx: SetupFulfillmentContext = {
    orderId,
    stripeCustomerId: customerId,
    setupIntentId: si.id,
    checkoutSessionId: null,
  };
  const flow = metadataFlow(si.metadata);
  if (flow === STRIPE_METADATA_FLOW_M4C_SETUP) {
    return fulfillM4cVendorApprovalRequestAfterSetupSaved(supabase, event.id, ctx);
  }
  if (flow === STRIPE_METADATA_FLOW_M4C_PAYMENT_RECOVERY) {
    return fulfillM4cSettlementRecoveryAfterSetupSaved(supabase, event.id, ctx);
  }

  await insertStripeWebhookEvent(supabase, event.id);
  return { status: "ignored", reason: "unsupported_flow" };
}

export type CreateSettlementPaymentIntentForOrderInput = {
  order: Order;
  amountCents: number;
  idempotencyKey: string;
};

/**
 * M4-C: single off-session **`PaymentIntent`** using the saved payment method from the order’s
 * **`SetupIntent`** (see ADR-M4-C).
 */
export async function createSettlementPaymentIntentForOrder(
  input: CreateSettlementPaymentIntentForOrderInput,
): Promise<Stripe.PaymentIntent> {
  if (input.amountCents < 1) {
    throw new Error("Settlement amount must be at least 1 cent");
  }
  const stripe = getStripe();
  const setupIntent = await stripe.setupIntents.retrieve(
    input.order.stripe_setup_intent_id!,
  );
  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;
  if (!paymentMethodId) {
    throw new Error("SetupIntent has no payment_method for settlement");
  }

  return stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.order.currency,
      customer: input.order.stripe_customer_id!,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        [STRIPE_METADATA_ORDER_ID_KEY]: input.order.id,
        flow: STRIPE_METADATA_FLOW_M4C_SETTLEMENT,
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

function expandedCharge(
  value: string | Stripe.Charge | null | undefined,
): Stripe.Charge | null {
  if (!value || typeof value === "string") {
    return null;
  }
  return value;
}

export async function getOrderPaymentSummary(
  order: Pick<
    Order,
    "status" | "stripe_payment_intent_id" | "settlement_charge_attempt_count"
  >,
): Promise<OrderPaymentSummary | null> {
  if (
    order.status !== "payment_pending" &&
    order.status !== "paid" &&
    order.status !== "failed"
  ) {
    return null;
  }

  const fallbackSummary: OrderPaymentSummary = {
    status:
      order.status === "payment_pending"
        ? "processing"
        : order.status === "paid"
          ? "paid"
          : "failed",
    receipt_url: null,
    failure_message: null,
    can_retry_with_payment_method_update:
      order.status === "failed" && order.settlement_charge_attempt_count === 2,
    show_contact_support:
      order.status === "failed" && order.settlement_charge_attempt_count >= 3,
  };

  if (!order.stripe_payment_intent_id) {
    return fallbackSummary;
  }

  try {
    const pi = await getStripe().paymentIntents.retrieve(
      order.stripe_payment_intent_id,
      { expand: ["latest_charge"] },
    );
    const latestCharge = expandedCharge(
      pi.latest_charge as string | Stripe.Charge | null | undefined,
    );

    return {
      ...fallbackSummary,
      receipt_url: latestCharge?.receipt_url ?? null,
      failure_message:
        typeof pi.last_payment_error?.message === "string"
          ? pi.last_payment_error.message
          : latestCharge?.failure_message ?? null,
    };
  } catch {
    return fallbackSummary;
  }
}

export type FulfillSettlementPaymentIntentSucceededResult =
  | { status: "duplicate_event" }
  | { status: "already_paid" }
  | {
      status: "ignored";
      reason: "not_settlement_flow" | "missing_order_id" | "order_not_found";
    }
  | { status: "reconciliation_required" }
  | { status: "success" };

/**
 * M4-C: **`payment_intent.succeeded`** for the settlement charge — idempotent via
 * **`orders.stripe_payment_intent_id`** / **`stripe_webhook_events`**.
 */
export async function fulfillSettlementPaymentIntentSucceeded(
  event: Stripe.Event,
  supabase: SupabaseClient<Database>,
): Promise<FulfillSettlementPaymentIntentSucceededResult> {
  if (event.type !== "payment_intent.succeeded") {
    throw new Error(
      "fulfillSettlementPaymentIntentSucceeded expects payment_intent.succeeded",
    );
  }

  if (await stripeWebhookEventExists(supabase, event.id)) {
    return { status: "duplicate_event" };
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  if (pi.metadata?.flow !== STRIPE_METADATA_FLOW_M4C_SETTLEMENT) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "not_settlement_flow" };
  }

  const orderId = metadataOrderId(pi.metadata);
  if (!orderId) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "missing_order_id" };
  }

  const order = await getOrderById(supabase, orderId);
  if (!order) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "order_not_found" };
  }

  if (order.status === "paid") {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "already_paid" };
  }

  const bookings = await listOrderBookingLinesForM4c(supabase, orderId);
  const expectedSettlementAmountCents = computeConfirmedSettlementTotalCents(bookings);
  const capturedPaymentIntentAmountCents = pi.amount;
  const isAmountMismatch = capturedPaymentIntentAmountCents !== expectedSettlementAmountCents;
  const isCurrencyMismatch = pi.currency.toLowerCase() !== order.currency.toLowerCase();
  if (isAmountMismatch || isCurrencyMismatch) {
    const transitioned = await markOrderReconciliationRequiredAfterSettlementMismatch(supabase, {
      orderId,
      capturedStripePaymentIntentId: pi.id,
    });
    if (!transitioned) {
      const fresh = await getOrderById(supabase, orderId);
      if (fresh?.status !== "reconciliation_required") {
        throw new Error(
          "Could not transition order to reconciliation_required after settlement mismatch",
        );
      }
    }
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "reconciliation_required" };
  }

  try {
    await updateOrderPaidAfterSettlementCapture(supabase, orderId, pi.id);
  } catch {
    const fresh = await getOrderById(supabase, orderId);
    if (fresh?.status === "paid") {
      await insertStripeWebhookEvent(supabase, event.id);
      return { status: "already_paid" };
    }
    throw new Error("Could not transition order to paid after settlement");
  }

  await safeSendOrderStatusEmailHook(supabase, {
    orderId,
    event: "payment_completed",
  });
  await insertStripeWebhookEvent(supabase, event.id);
  return { status: "success" };
}

export type FulfillSettlementPaymentIntentPaymentFailedResult =
  | { status: "duplicate_event" }
  | { status: "already_paid" }
  | {
      status: "ignored";
      reason:
        | "not_settlement_flow"
        | "unexpected_attempt_count"
        | "order_not_payment_pending"
        | "missing_order_id"
        | "order_not_found";
    }
  | { status: "stale_intent" }
  | { status: "retry_scheduled" }
  | { status: "terminal_failed" };

/**
 * M4-C: **`payment_intent.payment_failed`** — one automatic retry, then **`failed`**.
 * A final customer-initiated payment-method update can produce attempt `3`, which is terminal
 * as well when that recovery charge fails.
 */
export async function fulfillSettlementPaymentIntentPaymentFailed(
  event: Stripe.Event,
  supabase: SupabaseClient<Database>,
): Promise<FulfillSettlementPaymentIntentPaymentFailedResult> {
  if (event.type !== "payment_intent.payment_failed") {
    throw new Error(
      "fulfillSettlementPaymentIntentPaymentFailed expects payment_intent.payment_failed",
    );
  }

  if (await stripeWebhookEventExists(supabase, event.id)) {
    return { status: "duplicate_event" };
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  if (pi.metadata?.flow !== STRIPE_METADATA_FLOW_M4C_SETTLEMENT) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "not_settlement_flow" };
  }

  const orderId = metadataOrderId(pi.metadata);
  if (!orderId) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "missing_order_id" };
  }

  const order = await getOrderById(supabase, orderId);
  if (!order) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "order_not_found" };
  }

  if (order.status === "paid") {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "already_paid" };
  }

  if (order.stripe_payment_intent_id !== pi.id) {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "stale_intent" };
  }

  if (order.status !== "payment_pending") {
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "ignored", reason: "order_not_payment_pending" };
  }

  const attempt = order.settlement_charge_attempt_count;
  if (attempt === 1) {
    const bookings = await listOrderBookingLinesForM4c(supabase, orderId);
    const amountCents = computeConfirmedSettlementTotalCents(bookings);
    const retryPi = await createSettlementPaymentIntentForOrder({
      order,
      amountCents,
      idempotencyKey: buildSettlementIdempotencyKey(
        orderId,
        order.stripe_setup_intent_id!,
        2,
      ),
    });
    const attached = await attachSettlementRetryPaymentIntent(supabase, {
      orderId,
      priorStripePaymentIntentId: pi.id,
      newStripePaymentIntentId: retryPi.id,
    });
    if (!attached) {
      await getStripe().paymentIntents.cancel(retryPi.id);
    }
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "retry_scheduled" };
  }

  if (attempt === 2 || attempt === 3) {
    const marked = await markOrderFailedAfterSettlementExhausted(
      supabase,
      orderId,
      pi.id,
    );
    if (!marked) {
      await insertStripeWebhookEvent(supabase, event.id);
      return { status: "stale_intent" };
    }
    await safeSendOrderStatusEmailHook(supabase, {
      orderId,
      event: "payment_failed",
    });
    await insertStripeWebhookEvent(supabase, event.id);
    return { status: "terminal_failed" };
  }

  await insertStripeWebhookEvent(supabase, event.id);
  return { status: "ignored", reason: "unexpected_attempt_count" };
}
