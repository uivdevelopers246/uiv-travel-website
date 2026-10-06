import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { listAccommodationBookings, type ListAccommodationBookingsOptions } from "./service";
import { enrichAccommodationBookings } from "./previews";

export async function listVendorAccommodationOptions(
  supabase: SupabaseClient<Database>,
  vendorId: string,
) {
  const { data, error } = await supabase.from("accommodations")
    .select("id, name").eq("vendor_id", vendorId).order("name", { ascending: true });
  if (error) throw new Error(`Could not load vendor accommodations: ${error.message}`);
  return data ?? [];
}

export async function listVendorAccommodationBookingPreviews(
  supabase: SupabaseClient<Database>,
  options: ListAccommodationBookingsOptions & { vendorId: string },
) {
  const bookings = await listAccommodationBookings(supabase, options);
  if (bookings.length === 0) return [];
  const [previews, { data: profiles, error }] = await Promise.all([
    enrichAccommodationBookings(supabase, bookings),
    supabase.from("profiles").select("id, display_name")
      .in("id", [...new Set(bookings.map((booking) => booking.user_id))]),
  ]);
  if (error) throw new Error(`Could not load booking customers: ${error.message}`);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  return previews.map((booking) => ({
    ...booking,
    customer_name: names.get(booking.user_id)?.trim() || "Guest",
  }));
}
