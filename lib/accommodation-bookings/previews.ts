import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import type { AccommodationBooking } from "./service";
import type { AccommodationBookingWithPreview } from "@/lib/orders/types";
import { BOOKING_APPROVAL_SLA_MS } from "@/lib/activity-bookings/sla";

export async function enrichAccommodationBookings(
  supabase: SupabaseClient<Database>,
  bookings: AccommodationBooking[],
): Promise<AccommodationBookingWithPreview[]> {
  if (bookings.length === 0) return [];
  const { data, error } = await supabase
    .from("accommodations")
    .select("id, name, image_url")
    .in("id", [...new Set(bookings.map((booking) => booking.accommodation_id))]);
  if (error) throw new Error(`Could not load booking accommodations: ${error.message}`);
  const listings = new Map((data ?? []).map((listing) => [listing.id, listing]));

  return bookings.map((booking) => {
    const listing = listings.get(booking.accommodation_id);
    const createdAt = new Date(booking.created_at).getTime();
    return {
      ...booking,
      accommodation_name: listing?.name ?? "Accommodation unavailable",
      accommodation_image_url: listing?.image_url ?? null,
      approval_deadline_at: booking.status === "pending_approval"
        ? booking.expires_at ?? (Number.isFinite(createdAt)
          ? new Date(createdAt + BOOKING_APPROVAL_SLA_MS).toISOString() : null)
        : null,
    };
  });
}
