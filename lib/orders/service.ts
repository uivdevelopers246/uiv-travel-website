import type { SupabaseClient } from "@supabase/supabase-js";
import { listCartLines } from "@/lib/cart/service";
import type { CartLine } from "@/lib/cart/types";
import { ORDER_CURRENCY_USD, ORDER_STATUS_SET, type OrderStatus } from "@/lib/orders/constants";
import type { Order } from "@/lib/orders/types";
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

export async function findOrderByStripeApprovalPaymentIntentId(
  supabase: SupabaseClient<Database>,
  stripeApprovalPaymentIntentId: string,
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_approval_payment_intent_id", stripeApprovalPaymentIntentId)
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not find order by approval payment intent", error);
  }
  return data;
}

/**
 * M4-C: after vendor-approval capture succeeds (`payment_intent.succeeded` with approval metadata).
 */
export async function updateOrderPaidAfterApprovalCapture(
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
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not mark order paid after approval capture", error);
  }
  if (!data) {
    throw new Error("Order not found");
  }
  return data;
}

/**
 * M4-C: record the approval PaymentIntent id when the vendor approves (before confirm). Used for
 * webhook correlation and idempotency.
 */
export async function updateOrderStripeApprovalPaymentIntentId(
  supabase: SupabaseClient<Database>,
  orderId: string,
  stripeApprovalPaymentIntentId: string,
): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({ stripe_approval_payment_intent_id: stripeApprovalPaymentIntentId })
    .eq("id", orderId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw orderServiceError("Could not store approval payment intent on order", error);
  }
  if (!data) {
    throw new Error("Order not found");
  }
  return data;
}

export async function updateOrderStatusPaymentPending(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<Order> {
  return updateOrderStatus(supabase, orderId, "payment_pending");
}
