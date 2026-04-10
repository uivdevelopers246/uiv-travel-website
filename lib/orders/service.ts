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

export async function findAwaitingPaymentOrderForUser(
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
    throw orderServiceError("Could not find awaiting_payment order", error);
  }
  return data;
}

export async function upsertAwaitingPaymentOrderFromCart(
  supabase: SupabaseClient<Database>,
): Promise<Order> {
  const userId = await requireAuthUserId(supabase);

  const lines = await listCartLines(supabase);
  if (lines.length === 0) {
    throw new Error("Cart is empty");
  }

  const totals = computeOrderTotalsFromCartLines(lines);

  const existing = await findAwaitingPaymentOrderForUser(supabase);

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
