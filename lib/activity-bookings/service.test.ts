import { describe, it, expect, vi } from "vitest";
import {
  createActivityBookingAfterPayment,
  setActivityBookingCompleted,
} from "./service";

function makeMockSupabaseForCreateBooking() {
  const supabase: any = {
    rpc: vi.fn(),
  };
  return { supabase };
}

function makeMockSupabaseForSetCompleted() {
  const bookingsQuery: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  const supabase: any = {
    from: vi.fn(() => bookingsQuery),
  };
  return { supabase, bookingsQuery };
}

const baseCreateInput = {
  slot_id: "slot-1",
  activity_id: "act-1",
  user_id: "user-1",
  vendor_id: "vendor-1",
  order_id: "order-1",
  participants: 2,
  unit_price_cents: 5000,
  subtotal_cents: 10000,
  total_cents: 10000,
};

describe("activity-bookings service (writes)", () => {
  it("createActivityBookingAfterPayment: atomic RPC returns row", async () => {
    const { supabase } = makeMockSupabaseForCreateBooking();
    const inserted = {
      ...baseCreateInput,
      id: "booking-1",
      status: "confirmed",
      discount_cents: 0,
      created_at: "t0",
      updated_at: "t0",
    };
    supabase.rpc.mockResolvedValueOnce({ data: inserted, error: null });

    const row = await createActivityBookingAfterPayment(supabase, baseCreateInput);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_activity_booking_after_payment",
      {
        p_slot_id: "slot-1",
        p_activity_id: "act-1",
        p_user_id: "user-1",
        p_vendor_id: "vendor-1",
        p_order_id: "order-1",
        p_participants: 2,
        p_unit_price_cents: 5000,
        p_subtotal_cents: 10000,
        p_discount_cents: 0,
        p_total_cents: 10000,
        p_status: "confirmed",
      },
    );
    expect(row).toEqual(inserted);
  });

  it("createActivityBookingAfterPayment: RPC error throws", async () => {
    const { supabase } = makeMockSupabaseForCreateBooking();
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Not enough capacity on this slot" },
    });

    await expect(
      createActivityBookingAfterPayment(supabase, baseCreateInput),
    ).rejects.toThrow("Not enough capacity on this slot");
  });

  it("setActivityBookingCompleted: isAdmin true runs update", async () => {
    const { supabase, bookingsQuery } = makeMockSupabaseForSetCompleted();
    const updated = { id: "b1", status: "completed" };
    bookingsQuery.single.mockResolvedValueOnce({ data: updated, error: null });

    const row = await setActivityBookingCompleted(supabase, "b1", {
      isAdmin: true,
    });

    expect(bookingsQuery.update).toHaveBeenCalledWith({ status: "completed" });
    expect(bookingsQuery.eq).toHaveBeenCalledWith("id", "b1");
    expect(row).toEqual(updated);
  });

  it("setActivityBookingCompleted: isAdmin false throws without update", async () => {
    const { supabase, bookingsQuery } = makeMockSupabaseForSetCompleted();

    await expect(
      setActivityBookingCompleted(supabase, "b1", { isAdmin: false }),
    ).rejects.toThrow("Forbidden");

    expect(supabase.from).not.toHaveBeenCalled();
    expect(bookingsQuery.update).not.toHaveBeenCalled();
  });
});
