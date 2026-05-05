import type { SupabaseClient } from "@supabase/supabase-js";

import { getActivityBookingById } from "@/lib/activity-bookings/service";
import { getOrderById } from "@/lib/orders/service";
import type { Database } from "@/supabase/types/database";

type BookingNotificationEvent =
  | "booking_confirmed"
  | "booking_declined"
  | "booking_expired";

type OrderNotificationEvent = "payment_completed" | "payment_failed";

type StatusEmailWebhookResult =
  | { delivered: true }
  | { delivered: false; reason: "not_configured" | "missing_context" };

type RecipientSummary = {
  userId: string;
  email: string | null;
  displayName: string | null;
};

function getStatusEmailWebhookUrl(): string | null {
  const value = process.env.STATUS_EMAIL_WEBHOOK_URL?.trim();
  return value ? value : null;
}

function getStatusEmailWebhookSecret(): string | null {
  const value = process.env.STATUS_EMAIL_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}

async function loadRecipientSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecipientSummary> {
  const [{ data: profile }, adminResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  return {
    userId,
    email: adminResult.data.user?.email ?? null,
    displayName: profile?.display_name ?? null,
  };
}

async function postStatusEmailHook(payload: unknown): Promise<StatusEmailWebhookResult> {
  const webhookUrl = getStatusEmailWebhookUrl();
  if (!webhookUrl) {
    return { delivered: false, reason: "not_configured" };
  }

  const secret = getStatusEmailWebhookSecret();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Status email webhook failed with ${response.status}`);
  }

  return { delivered: true };
}

export async function sendBookingStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: { bookingId: string; event: BookingNotificationEvent },
): Promise<StatusEmailWebhookResult> {
  if (!getStatusEmailWebhookUrl()) {
    return { delivered: false, reason: "not_configured" };
  }

  const booking = await getActivityBookingById(supabase, input.bookingId);
  if (!booking || !booking.order_id) {
    return { delivered: false, reason: "missing_context" };
  }

  const [order, recipient, slotResult, activityResult] = await Promise.all([
    getOrderById(supabase, booking.order_id),
    loadRecipientSummary(supabase, booking.user_id),
    supabase
      .from("availability_slots")
      .select("starts_at, ends_at")
      .eq("id", booking.slot_id)
      .maybeSingle(),
    supabase
      .from("activities")
      .select("title")
      .eq("id", booking.activity_id)
      .maybeSingle(),
  ]);

  if (!order) {
    return { delivered: false, reason: "missing_context" };
  }

  return postStatusEmailHook({
    source: "uiv-travel-website",
    category: "booking",
    event: input.event,
    occurredAt: new Date().toISOString(),
    recipient,
    order: {
      id: order.id,
      status: order.status,
      currency: order.currency,
      totalCents: order.total_cents,
    },
    booking: {
      id: booking.id,
      status: booking.status,
      participants: booking.participants,
      activityId: booking.activity_id,
      activityTitle: activityResult.data?.title ?? null,
      slotStartsAt: slotResult.data?.starts_at ?? null,
      slotEndsAt: slotResult.data?.ends_at ?? null,
    },
  });
}

export async function sendOrderStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: { orderId: string; event: OrderNotificationEvent },
): Promise<StatusEmailWebhookResult> {
  if (!getStatusEmailWebhookUrl()) {
    return { delivered: false, reason: "not_configured" };
  }

  const order = await getOrderById(supabase, input.orderId);
  if (!order) {
    return { delivered: false, reason: "missing_context" };
  }

  const recipient = await loadRecipientSummary(supabase, order.user_id);
  const { data: bookings } = await supabase
    .from("activity_bookings")
    .select("id, status")
    .eq("order_id", order.id);

  return postStatusEmailHook({
    source: "uiv-travel-website",
    category: "order",
    event: input.event,
    occurredAt: new Date().toISOString(),
    recipient,
    order: {
      id: order.id,
      status: order.status,
      currency: order.currency,
      totalCents: order.total_cents,
      bookingCount: bookings?.length ?? 0,
      bookingStatuses: (bookings ?? []).map((booking) => ({
        id: booking.id,
        status: booking.status,
      })),
    },
  });
}

export async function safeSendBookingStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: { bookingId: string; event: BookingNotificationEvent },
): Promise<void> {
  try {
    await sendBookingStatusEmailHook(supabase, input);
  } catch (error) {
    console.error("Booking status email hook failed", error);
  }
}

export async function safeSendOrderStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: { orderId: string; event: OrderNotificationEvent },
): Promise<void> {
  try {
    await sendOrderStatusEmailHook(supabase, input);
  } catch (error) {
    console.error("Order status email hook failed", error);
  }
}
