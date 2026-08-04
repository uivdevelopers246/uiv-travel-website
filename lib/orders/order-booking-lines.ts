import type { SupabaseClient } from "@supabase/supabase-js";

import { listActivityBookings } from "@/lib/activity-bookings/service";
import { listAccommodationBookings } from "@/lib/accommodation-bookings/service";
import type { Database } from "@/supabase/types/database";

/** Minimal booking line fields for M4-C terminal gate and settlement totals (ADR-M4-D). */
export type OrderBookingLineForM4c = {
  status: string;
  total_cents: number;
};

/**
 * Loads **activity** and **accommodation** booking rows for an order and maps them to the
 * shared M4-C settlement / decline-sync shape.
 */
export async function listOrderBookingLinesForM4c(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<OrderBookingLineForM4c[]> {
  const [activityBookings, accommodationBookings] = await Promise.all([
    listActivityBookings(supabase, { orderId, limit: 500 }),
    listAccommodationBookings(supabase, { orderId, limit: 500 }),
  ]);

  return [
    ...activityBookings.map((b) => ({
      status: b.status,
      total_cents: b.total_cents,
    })),
    ...accommodationBookings.map((b) => ({
      status: b.status,
      total_cents: b.total_cents,
    })),
  ];
}
