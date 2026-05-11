import type { SupabaseClient } from "@supabase/supabase-js";
import { listCartLines } from "@/lib/cart/service";
import type { CartLine } from "@/lib/cart/types";
import { BOOKING_APPROVAL_SLA_MS } from "@/lib/activity-bookings/sla";
import type { ActivityBooking } from "@/lib/activity-bookings/service";
import { ORDER_CURRENCY_USD, ORDER_STATUS_SET, type OrderStatus } from "@/lib/orders/constants";
import type {
  ActivityBookingWithPreview,
  Order,
  OrderWithActivityBookingsPreview,
} from "@/lib/orders/types";
import type { Database } from "@/supabase/types/database";

/** Wraps upstream errors so logs and API mapping identify which operation failed. */
function orderServiceError(
  operationDescription: string,
  cause?: { message?: string } | null,
): Error {
  const detail =
    cause && typeof cause.message === "string" && cause.message.trim() !== ""
      ? cause.message.trim()
      : "The database did not return a more specific message.";
  return new Error(`${operationDescription}: ${detail}`);
}

async function requireAuthUserId(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthorized");
  }
  return user.id;
}

export type OrderTotalsFromCart = {
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
};

/**
 * MVP totals from cart line snapshots. Empty cart yields zero cents (callers that
 * persist an order must reject an empty cart separately).
 */
export function computeOrderTotalsFromCartLines(
  lines: CartLine[],
): OrderTotalsFromCart {
  if (lines.length === 0) {
    return { subtotal_cents: 0, discount_cents: 0, total_cents: 0 };
  }
  let subtotal_cents = 0;
  for (const line of lines) {
    subtotal_cents += line.line_total_cents;
  }
  subtotal_cents = Math.max(0, Math.round(subtotal_cents));
  const discount_cents = 0;
  const total_cents = Math.max(0, subtotal_cents - discount_cents);
  return { subtotal_cents, discount_cents, total_cents };
}

/**
 * M4-C: finds the user’s open checkout order — **`awaiting_payment`** means “cart snapshot
 * persisted, Stripe setup not completed yet” (not “charge pending at checkout”).
 */
export async function findCheckoutSetupOrderForUser(
  supabase: SupabaseClient<Database>,
): Promise<Order | null> {
  const userId = await requireAuthUserId(supabase);

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "awaiting_payment")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not find checkout setup order", error);
  }
  return data;
}

/**
 * M4-C: creates or refreshes totals on the **`awaiting_payment`** order used for hosted
 * Checkout **`mode: setup`**. Webhooks transition **`awaiting_payment` → `awaiting_vendor_approval`**
 * after `metadata.order_id` correlates the completed setup to this row.
 */
export async function upsertCheckoutSetupOrderFromCart(
  supabase: SupabaseClient<Database>,
): Promise<Order> {
  const userId = await requireAuthUserId(supabase);

  const lines = await listCartLines(supabase);
  if (lines.length === 0) {
    throw new Error("Cart is empty");
  }

  const totals = computeOrderTotalsFromCartLines(lines);

  const existing = await findCheckoutSetupOrderForUser(supabase);

  if (existing) {
    const { data, error } = await supabase
      .from("orders")
      .update({
        subtotal_cents: totals.subtotal_cents,
        discount_cents: totals.discount_cents,
        total_cents: totals.total_cents,
        currency: ORDER_CURRENCY_USD,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw orderServiceError("Could not update order from cart", error);
    }
    return data;
  }

  const { data, error } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      status: "awaiting_payment",
      currency: ORDER_CURRENCY_USD,
      subtotal_cents: totals.subtotal_cents,
      discount_cents: totals.discount_cents,
      total_cents: totals.total_cents,
    })
    .select("*")
    .single();

  if (error) {
    throw orderServiceError("Could not create order from cart", error);
  }
  return data;
}

export async function updateOrderStripeCheckoutSession(
  supabase: SupabaseClient<Database>,
  input: { orderId: string; stripeCheckoutSessionId: string },
): Promise<Order> {
  await requireAuthUserId(supabase);

  const { data, error } = await supabase
    .from("orders")
    .update({ stripe_checkout_session_id: input.stripeCheckoutSessionId })
    .eq("id", input.orderId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not update order Stripe checkout session", error);
  }
  if (!data) {
    throw new Error("Order not found");
  }
  return data;
}

export async function getOrderById(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not load order", error);
  }
  return data;
}

function getApprovalDeadlineAt(booking: ActivityBooking): string | null {
  if (booking.status !== "pending_approval") {
    return null;
  }

  if (booking.expires_at) {
    return booking.expires_at;
  }

  const createdAtMs = new Date(booking.created_at).getTime();
  if (Number.isNaN(createdAtMs)) {
    return null;
  }

  return new Date(createdAtMs + BOOKING_APPROVAL_SLA_MS).toISOString();
}

function compareBookingsForDisplay(
  left: ActivityBookingWithPreview,
  right: ActivityBookingWithPreview,
): number {
  if (left.slot_starts_at && right.slot_starts_at) {
    return left.slot_starts_at.localeCompare(right.slot_starts_at);
  }
  if (left.slot_starts_at) {
    return -1;
  }
  if (right.slot_starts_at) {
    return 1;
  }
  return left.created_at.localeCompare(right.created_at);
}

export async function listOrdersWithActivityBookingsPreview(
  supabase: SupabaseClient<Database>,
  options?: { orderId?: string },
): Promise<OrderWithActivityBookingsPreview[]> {
  const userId = await requireAuthUserId(supabase);

  let ordersQuery = supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId);

  if (options?.orderId) {
    ordersQuery = ordersQuery.eq("id", options.orderId);
  }

  const { data: orders, error: ordersError } = await ordersQuery.order(
    "created_at",
    { ascending: false },
  );

  if (ordersError) {
    throw orderServiceError("Could not list orders", ordersError);
  }

  if (!orders || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map((order) => order.id);
  const { data: bookings, error: bookingsError } = await supabase
    .from("activity_bookings")
    .select("*")
    .eq("user_id", userId)
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (bookingsError) {
    throw orderServiceError(
      "Could not list activity bookings for orders",
      bookingsError,
    );
  }

  if (!bookings || bookings.length === 0) {
    return orders.map((order) => ({
      ...order,
      activity_bookings: [],
    }));
  }

  const slotIds = [...new Set(bookings.map((booking) => booking.slot_id))];
  const activityIds = [...new Set(bookings.map((booking) => booking.activity_id))];

  const slotMap = new Map<
    string,
    Pick<
      Database["public"]["Tables"]["availability_slots"]["Row"],
      "id" | "starts_at" | "ends_at"
    >
  >();
  if (slotIds.length > 0) {
    const { data: slots, error: slotsError } = await supabase
      .from("availability_slots")
      .select("id, starts_at, ends_at")
      .in("id", slotIds);

    if (slotsError) {
      throw orderServiceError("Could not load order slot details", slotsError);
    }

    for (const slot of slots ?? []) {
      slotMap.set(slot.id, slot);
    }
  }

  const activityPreviewById = new Map<
    string,
    { title: string; image_url: string | null }
  >();
  if (activityIds.length > 0) {
    const { data: activities, error: activitiesError } = await supabase
      .from("activities")
      .select("id, title, image_url")
      .in("id", activityIds);

    if (activitiesError) {
      throw orderServiceError("Could not load order activity details", activitiesError);
    }

    for (const activity of activities ?? []) {
      activityPreviewById.set(activity.id, {
        title: activity.title,
        image_url: activity.image_url,
      });
    }
  }

  const bookingsByOrderId = new Map<string, ActivityBookingWithPreview[]>();

  for (const booking of bookings) {
    if (!booking.order_id) {
      continue;
    }

    const slot = slotMap.get(booking.slot_id);
    const activityPreview = activityPreviewById.get(booking.activity_id);
    const preview: ActivityBookingWithPreview = {
      ...booking,
      activity_title: activityPreview?.title ?? "Activity unavailable",
      activity_image_url: activityPreview?.image_url ?? null,
      slot_starts_at: slot?.starts_at ?? "",
      slot_ends_at: slot?.ends_at ?? "",
      approval_deadline_at: getApprovalDeadlineAt(booking),
    };

    const orderBookings = bookingsByOrderId.get(booking.order_id) ?? [];
    orderBookings.push(preview);
    bookingsByOrderId.set(booking.order_id, orderBookings);
  }

  return orders
    .map((order) => ({
      ...order,
      activity_bookings: (bookingsByOrderId.get(order.id) ?? []).sort(
        compareBookingsForDisplay,
      ),
    }));
}

export async function updateOrderStatus(
  supabase: SupabaseClient<Database>,
  orderId: string,
  status: OrderStatus,
): Promise<Order> {
  if (!ORDER_STATUS_SET.has(status)) {
    throw new Error("Invalid order status");
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not update order status", error);
  }
  if (!data) {
    throw new Error("Order not found");
  }
  return data;
}

/**
 * M4-C: atomically move **`awaiting_payment` → `awaiting_vendor_approval`** after SetupIntent /
 * Checkout setup success. Returns **`null`** if the row was not in **`awaiting_payment`** (race or replay).
 */
export async function updateOrderAwaitingVendorApprovalFromSetup(
  supabase: SupabaseClient<Database>,
  input: {
    orderId: string;
    stripeCustomerId: string;
    stripeSetupIntentId: string;
  },
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "awaiting_vendor_approval",
      stripe_customer_id: input.stripeCustomerId,
      stripe_setup_intent_id: input.stripeSetupIntentId,
    })
    .eq("id", input.orderId)
    .eq("status", "awaiting_payment")
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError(
      "Could not transition order to awaiting_vendor_approval",
      error,
    );
  }
  return data;
}

/**
 * M4-C: rollback a failed setup fulfillment (no charge). Clears setup correlation fields.
 */
export async function revertOrderToAwaitingPaymentAfterSetupFailure(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "awaiting_payment",
      stripe_setup_intent_id: null,
    })
    .eq("id", orderId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError(
      "Could not revert order after setup fulfillment failure",
      error,
    );
  }
  if (!data) {
    throw new Error("Order not found");
  }
  return data;
}

/**
 * M4-C: after the **single settlement** `payment_intent.succeeded` (charge sum of confirmed lines).
 * Not used until settlement capture is implemented.
 */
export async function updateOrderPaidAfterSettlementCapture(
  supabase: SupabaseClient<Database>,
  orderId: string,
  stripePaymentIntentId: string,
): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "paid",
      stripe_payment_intent_id: stripePaymentIntentId,
    })
    .eq("id", orderId)
    .in("status", ["awaiting_vendor_approval", "payment_pending"])
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not mark order paid after settlement capture", error);
  }
  if (!data) {
    throw new Error("Order not found or not eligible for settlement paid transition");
  }
  return data;
}

export async function updateOrderStatusPaymentPending(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<Order> {
  return updateOrderStatus(supabase, orderId, "payment_pending");
}

/**
 * M4-C: first settlement PI created off-session — move to **`payment_pending`** and record attempt **1**.
 * Returns **`null`** if another writer already attached a PI (idempotent loss).
 */
export async function attachFirstSettlementPaymentIntent(
  supabase: SupabaseClient<Database>,
  orderId: string,
  stripePaymentIntentId: string,
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "payment_pending",
      stripe_payment_intent_id: stripePaymentIntentId,
      settlement_charge_attempt_count: 1,
    })
    .eq("id", orderId)
    .eq("status", "awaiting_vendor_approval")
    .is("stripe_payment_intent_id", null)
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not attach settlement PaymentIntent", error);
  }
  return data;
}

/**
 * M4-C: single retry PI after first **`payment_failed`** — attempt count **2** must match prior PI id.
 */
export async function attachSettlementRetryPaymentIntent(
  supabase: SupabaseClient<Database>,
  input: {
    orderId: string;
    priorStripePaymentIntentId: string;
    newStripePaymentIntentId: string;
  },
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      stripe_payment_intent_id: input.newStripePaymentIntentId,
      settlement_charge_attempt_count: 2,
    })
    .eq("id", input.orderId)
    .eq("status", "payment_pending")
    .eq("stripe_payment_intent_id", input.priorStripePaymentIntentId)
    .eq("settlement_charge_attempt_count", 1)
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not attach settlement retry PaymentIntent", error);
  }
  return data;
}

/**
 * After a retry-eligible failure, a buyer can update the saved payment method and send the
 * previously confirmed bookings back through vendor review before any new settlement attempt.
 */
export async function requeueFailedOrderForVendorApproval(
  supabase: SupabaseClient<Database>,
  input: {
    orderId: string;
    stripeCustomerId: string;
    stripeSetupIntentId: string;
  },
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "awaiting_vendor_approval",
      stripe_customer_id: input.stripeCustomerId,
      stripe_setup_intent_id: input.stripeSetupIntentId,
      stripe_payment_intent_id: null,
      settlement_charge_attempt_count: 0,
    })
    .eq("id", input.orderId)
    .eq("status", "failed")
    .eq("settlement_charge_attempt_count", 2)
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError(
      "Could not requeue failed order for vendor approval",
      error,
    );
  }
  return data;
}

/**
 * M4-C: both settlement attempts failed — order **`failed`** (bookings cancelled separately).
 */
export async function markOrderFailedAfterSettlementExhausted(
  supabase: SupabaseClient<Database>,
  orderId: string,
  failedStripePaymentIntentId: string,
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "failed",
    })
    .eq("id", orderId)
    .eq("status", "payment_pending")
    .eq("stripe_payment_intent_id", failedStripePaymentIntentId)
    .in("settlement_charge_attempt_count", [2, 3])
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not mark order failed after settlement exhaustion", error);
  }
  return data;
}

/**
 * M4-C: settlement succeeded in Stripe but expected/order totals did not match captured values.
 * Moves eligible orders to **`reconciliation_required`** for manual follow-up.
 */
export async function markOrderReconciliationRequiredAfterSettlementMismatch(
  supabase: SupabaseClient<Database>,
  input: {
    orderId: string;
    capturedStripePaymentIntentId: string;
  },
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "reconciliation_required",
    })
    .eq("id", input.orderId)
    .eq("stripe_payment_intent_id", input.capturedStripePaymentIntentId)
    .in("status", ["awaiting_vendor_approval", "payment_pending"])
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError(
      "Could not mark order reconciliation_required after settlement mismatch",
      error,
    );
  }
  return data;
}
