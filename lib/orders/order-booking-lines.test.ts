import { describe, it, expect, vi, beforeEach } from "vitest";

import { listOrderBookingLinesForM4c } from "./order-booking-lines";
import { listActivityBookings } from "@/lib/activity-bookings/service";
import { listAccommodationBookings } from "@/lib/accommodation-bookings/service";

vi.mock("@/lib/activity-bookings/service", () => ({
  listActivityBookings: vi.fn(),
}));

vi.mock("@/lib/accommodation-bookings/service", () => ({
  listAccommodationBookings: vi.fn(),
}));

describe("listOrderBookingLinesForM4c", () => {
  const supabase = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges activity and accommodation booking status/totals", async () => {
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "confirmed", total_cents: 1000 },
    ] as never);
    vi.mocked(listAccommodationBookings).mockResolvedValue([
      { status: "pending_approval", total_cents: 45000 },
    ] as never);

    const lines = await listOrderBookingLinesForM4c(supabase, "order-1");

    expect(listActivityBookings).toHaveBeenCalledWith(supabase, {
      orderId: "order-1",
      limit: 500,
    });
    expect(listAccommodationBookings).toHaveBeenCalledWith(supabase, {
      orderId: "order-1",
      limit: 500,
    });
    expect(lines).toEqual([
      { status: "confirmed", total_cents: 1000 },
      { status: "pending_approval", total_cents: 45000 },
    ]);
  });
});
