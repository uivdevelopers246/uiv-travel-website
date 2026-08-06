import type { Json } from "@/supabase/types/database";

export type NotificationChannel = "email";

export type NotificationEventType =
  | "booking_confirmed"
  | "booking_declined"
  | "booking_expired"
  | "payment_completed"
  | "payment_failed"
  | "order_receipt"
  | "provider_booking_pending"
  | "daily_digest";

export type NotificationStatus =
  | "pending"
  | "published"
  | "processing"
  | "sent"
  | "skipped"
  | "failed";

export type NotificationPayload = Json;

export type NotificationPublishMessage = {
  notificationId: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  userId: string;
  dedupeKey: string | null;
};
