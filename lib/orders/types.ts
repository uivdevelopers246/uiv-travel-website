import type { Database } from "@/supabase/types/database";
import type { ActivityBooking } from "@/lib/activity-bookings/service";

/** Row from `orders`; RLS scopes reads/writes to the owning user (or service role for webhooks). */
export type Order = Database["public"]["Tables"]["orders"]["Row"];

export type ActivityBookingWithPreview = ActivityBooking & {
  activity_title: string;
  slot_starts_at: string;
  slot_ends_at: string;
  approval_deadline_at: string | null;
};

export type OrderWithActivityBookingsPreview = Order & {
  activity_bookings: ActivityBookingWithPreview[];
};

export type OrderPaymentSummary = {
  status: "processing" | "paid" | "failed";
  receipt_url: string | null;
  failure_message: string | null;
  can_retry_with_payment_method_update: boolean;
  show_contact_support: boolean;
};

export type OrderWithActivityBookingsPaymentPreview =
  OrderWithActivityBookingsPreview & {
    payment_summary: OrderPaymentSummary | null;
  };
