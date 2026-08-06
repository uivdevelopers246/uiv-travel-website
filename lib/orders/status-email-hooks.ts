import type { SupabaseClient } from "@supabase/supabase-js";

import { getAccommodationBookingById } from "@/lib/accommodation-bookings/service";
import { getActivityBookingById } from "@/lib/activity-bookings/service";
import {
  createNotificationEvent,
} from "@/lib/notifications/events";
import { processNotificationMessage } from "@/lib/notifications/email-worker";
import type { NotificationEventType, NotificationPayload } from "@/lib/notifications/types";
import { getOrderById } from "@/lib/orders/service";
import type { Database } from "@/supabase/types/database";

type BookingNotificationEvent = Extract<
  NotificationEventType,
  "booking_confirmed" | "booking_declined" | "booking_expired"
>;

type OrderNotificationEvent = Extract<
  NotificationEventType,
  "payment_completed" | "payment_failed"
>;

export type BookingStatusEmailLineType = "activity" | "accommodation";

type BookingStatusEmailInput = {
  bookingId: string;
  event: BookingNotificationEvent;
  /** When omitted, activity is tried first, then accommodation. */
  lineType?: BookingStatusEmailLineType;
};

type StatusEmailWebhookResult =
  | { delivered: true }
  | {
      delivered: false;
      reason: "not_configured" | "missing_context" | "queued" | "failed";
    };

type RecipientSummary = {
  userId: string;
  email: string | null;
  displayName: string | null;
};

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

async function publishStatusNotification(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    eventType: NotificationEventType;
    payload: NotificationPayload;
    dedupeKey: string;
  },
): Promise<StatusEmailWebhookResult> {
  const notification = await createNotificationEvent(supabase, {
    userId: input.userId,
    eventType: input.eventType,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
  });

  if (notification.status === "sent") {
    return { delivered: true };
  }
  if (notification.status === "skipped") {
    return { delivered: false, reason: "failed" };
  }

  const status = await processNotificationMessage(supabase, {
    notificationId: notification.id,
  });
  if (status === "skipped") {
    return { delivered: false, reason: "missing_context" };
  }
  if (status === "sent") {
    return { delivered: true };
  }
  if (status === "failed" || status === "exhausted") {
    return { delivered: false, reason: "failed" };
  }
  return { delivered: false, reason: "queued" };
}

async function sendActivityBookingStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: { bookingId: string; event: BookingNotificationEvent },
): Promise<StatusEmailWebhookResult> {
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

  const payload = {
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
      lineType: "activity",
      status: booking.status,
      participants: booking.participants,
      activityId: booking.activity_id,
      activityTitle: activityResult.data?.title ?? null,
      slotStartsAt: slotResult.data?.starts_at ?? null,
      slotEndsAt: slotResult.data?.ends_at ?? null,
    },
  } satisfies NotificationPayload;

  return publishStatusNotification(supabase, {
    userId: booking.user_id,
    eventType: input.event,
    payload,
    dedupeKey: `booking:${booking.id}:${input.event}`,
  });
}

async function sendAccommodationBookingStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: { bookingId: string; event: BookingNotificationEvent },
): Promise<StatusEmailWebhookResult> {
  const booking = await getAccommodationBookingById(supabase, input.bookingId);
  if (!booking || !booking.order_id) {
    return { delivered: false, reason: "missing_context" };
  }

  const [order, recipient, accommodationResult] = await Promise.all([
    getOrderById(supabase, booking.order_id),
    loadRecipientSummary(supabase, booking.user_id),
    supabase
      .from("accommodations")
      .select("name")
      .eq("id", booking.accommodation_id)
      .maybeSingle(),
  ]);

  if (!order) {
    return { delivered: false, reason: "missing_context" };
  }

  const payload = {
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
      lineType: "accommodation",
      status: booking.status,
      guests: booking.guests,
      accommodationId: booking.accommodation_id,
      accommodationTitle: accommodationResult.data?.name ?? null,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
    },
  } satisfies NotificationPayload;

  return publishStatusNotification(supabase, {
    userId: booking.user_id,
    eventType: input.event,
    payload,
    dedupeKey: `booking:${booking.id}:${input.event}`,
  });
}

export async function sendBookingStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: BookingStatusEmailInput,
): Promise<StatusEmailWebhookResult> {
  if (input.lineType === "accommodation") {
    return sendAccommodationBookingStatusEmailHook(supabase, input);
  }
  if (input.lineType === "activity") {
    return sendActivityBookingStatusEmailHook(supabase, input);
  }

  const activityResult = await sendActivityBookingStatusEmailHook(supabase, input);
  if (activityResult.delivered || activityResult.reason !== "missing_context") {
    return activityResult;
  }
  return sendAccommodationBookingStatusEmailHook(supabase, input);
}

export async function sendOrderStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: { orderId: string; event: OrderNotificationEvent },
): Promise<StatusEmailWebhookResult> {
  const order = await getOrderById(supabase, input.orderId);
  if (!order) {
    return { delivered: false, reason: "missing_context" };
  }

  const recipient = await loadRecipientSummary(supabase, order.user_id);
  const [activityResult, accommodationResult] = await Promise.all([
    supabase
      .from("activity_bookings")
      .select("id, status")
      .eq("order_id", order.id),
    supabase
      .from("accommodation_bookings")
      .select("id, status")
      .eq("order_id", order.id),
  ]);

  const bookingStatuses = [
    ...(activityResult.data ?? []).map((booking) => ({
      id: booking.id,
      status: booking.status,
      lineType: "activity" as const,
    })),
    ...(accommodationResult.data ?? []).map((booking) => ({
      id: booking.id,
      status: booking.status,
      lineType: "accommodation" as const,
    })),
  ];

  const payload = {
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
      bookingCount: bookingStatuses.length,
      bookingStatuses,
    },
  } satisfies NotificationPayload;

  return publishStatusNotification(supabase, {
    userId: order.user_id,
    eventType: input.event,
    payload,
    dedupeKey: `order:${order.id}:${input.event}`,
  });
}

export async function safeSendBookingStatusEmailHook(
  supabase: SupabaseClient<Database>,
  input: BookingStatusEmailInput,
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
