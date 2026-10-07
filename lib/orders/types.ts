import type { Database } from "@/supabase/types/database";
import type { ActivityBooking } from "@/lib/activity-bookings/service";
import type { AccommodationBooking } from "@/lib/accommodation-bookings/service";

/** Row from `orders`; RLS scopes reads/writes to the owning user (or service role for webhooks). */
export type Order = Database["public"]["Tables"]["orders"]["Row"];

export type ActivityBookingWithPreview = ActivityBooking & {
  activity_title: string;
  activity_image_url: string | null;
  slot_starts_at: string;
  slot_ends_at: string;
  approval_deadline_at: string | null;
};

export type OrderWithActivityBookingsPreview = Order & {
  activity_bookings: ActivityBookingWithPreview[];
  accommodation_bookings?: AccommodationBookingWithPreview[];
};

export type AccommodationBookingWithPreview = AccommodationBooking & {
  accommodation_name: string;
  accommodation_image_url: string | null;
  approval_deadline_at: string | null;
};

export type BookingWithPreview = ActivityBookingWithPreview | AccommodationBookingWithPreview;

export function getOrderBookings(order: OrderWithActivityBookingsPreview): BookingWithPreview[] {
  return [...order.activity_bookings, ...(order.accommodation_bookings ?? [])];
}

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
