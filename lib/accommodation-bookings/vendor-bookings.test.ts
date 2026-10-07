import { describe, expect, it, vi } from "vitest";
import { listVendorAccommodationBookingPreviews } from "./vendor-bookings";

describe("vendor accommodation previews", () => {
  it("scopes bookings to the vendor and requested listing, then enriches stay details", async () => {
    const booking = {
      id: "stay-1", accommodation_id: "villa-1", user_id: "buyer-1",
      vendor_id: "vendor-1", status: "pending_approval", check_in: "2026-07-01",
      check_out: "2026-07-04", guests: 3, created_at: "2026-06-01T12:00:00Z",
      expires_at: null, total_cents: 45000,
    };
    const bookingsQuery = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [booking], error: null }),
    };
    const listingQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [{ id: "villa-1", name: "Beach Villa", image_url: "/villa.jpg" }], error: null }),
    };
    const profileQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [{ id: "buyer-1", display_name: "  Sam  " }], error: null }),
    };
    const supabase = {
      from: vi.fn((table) => table === "accommodation_bookings" ? bookingsQuery : table === "accommodations" ? listingQuery : profileQuery),
    };
    const results = await listVendorAccommodationBookingPreviews(supabase as never, {
      vendorId: "vendor-1", accommodationId: "villa-1", status: "pending_approval", limit: 20, offset: 5,
    });
    expect(bookingsQuery.eq).toHaveBeenCalledWith("vendor_id", "vendor-1");
    expect(bookingsQuery.eq).toHaveBeenCalledWith("accommodation_id", "villa-1");
    expect(bookingsQuery.eq).toHaveBeenCalledWith("status", "pending_approval");
    expect(bookingsQuery.range).toHaveBeenCalledWith(5, 24);
    expect(profileQuery.in).toHaveBeenCalledWith("id", ["buyer-1"]);
    expect(results).toEqual([{
      ...booking, accommodation_name: "Beach Villa", accommodation_image_url: "/villa.jpg",
      customer_name: "Sam", approval_deadline_at: "2026-06-02T12:00:00.000Z",
    }]);
  });
});
