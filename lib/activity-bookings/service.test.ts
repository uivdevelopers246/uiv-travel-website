import { describe, it, expect, vi } from "vitest";
import {
  cancelActivityBooking,
  cancelActivityBookingsForOrder,
  createActivityBookingAfterPayment,
  getActivityBookingById,
  listActivityBookings,
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

function makeMockSupabaseForListBookings() {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(),
  };
  const supabase: any = {
    from: vi.fn(() => query),
  };
  return { supabase, query };
}

function makeMockSupabaseForGetById() {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };
  const supabase: any = {
    from: vi.fn(() => query),
  };
  return { supabase, query };
}

function makeMockSupabaseForCancel() {
  return {
    supabase: {
      rpc: vi.fn(),
    } as any,
  };
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
        p_expires_at: null,
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
    ).rejects.toThrow(
      "Could not create activity booking after payment: Not enough capacity on this slot",
    );
  });

  it("createActivityBookingAfterPayment: RPC success but no data throws", async () => {
    const { supabase } = makeMockSupabaseForCreateBooking();
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      createActivityBookingAfterPayment(supabase, baseCreateInput),
    ).rejects.toThrow(
      "Activity booking was not created: create_activity_booking_after_payment returned no row.",
    );
  });

  it("createActivityBookingAfterPayment: passes discount_cents and status when set", async () => {
    const { supabase } = makeMockSupabaseForCreateBooking();
    const inserted = {
      ...baseCreateInput,
      id: "booking-2",
      status: "confirmed",
      discount_cents: 100,
      created_at: "t0",
      updated_at: "t0",
    };
    supabase.rpc.mockResolvedValueOnce({ data: inserted, error: null });

    await createActivityBookingAfterPayment(supabase, {
      ...baseCreateInput,
      discount_cents: 100,
      status: "confirmed",
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_activity_booking_after_payment",
      expect.objectContaining({
        p_discount_cents: 100,
        p_status: "confirmed",
      }),
    );
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

describe("activity-bookings service (reads + cancel)", () => {
  it("listActivityBookings: returns data and applies filters", async () => {
    const { supabase, query } = makeMockSupabaseForListBookings();
    const rows = [{ id: "b1" }];
    query.range.mockResolvedValueOnce({ data: rows, error: null });

    const result = await listActivityBookings(supabase, {
      userId: "user-1",
      vendorId: "vendor-1",
      activityId: "act-1",
      slotId: "slot-1",
      orderId: "ord-1",
      status: "confirmed",
      limit: 5,
      offset: 10,
    });

    expect(supabase.from).toHaveBeenCalledWith("activity_bookings");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.eq).toHaveBeenCalledWith("vendor_id", "vendor-1");
    expect(query.eq).toHaveBeenCalledWith("activity_id", "act-1");
    expect(query.eq).toHaveBeenCalledWith("slot_id", "slot-1");
    expect(query.eq).toHaveBeenCalledWith("order_id", "ord-1");
    expect(query.eq).toHaveBeenCalledWith("status", "confirmed");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.range).toHaveBeenCalledWith(10, 14);
    expect(result).toEqual(rows);
  });

  it("listActivityBookings: empty data becomes []", async () => {
    const { supabase, query } = makeMockSupabaseForListBookings();
    query.range.mockResolvedValueOnce({ data: null, error: null });

    const result = await listActivityBookings(supabase);
    expect(result).toEqual([]);
  });

  it("listActivityBookings: query error throws", async () => {
    const { supabase, query } = makeMockSupabaseForListBookings();
    query.range.mockResolvedValueOnce({
      data: null,
      error: { message: "connection reset by peer" },
    });

    await expect(listActivityBookings(supabase)).rejects.toThrow(
      "Could not list activity bookings: connection reset by peer",
    );
  });

  it("getActivityBookingById: returns row when found", async () => {
    const { supabase, query } = makeMockSupabaseForGetById();
    const row = { id: "b1", user_id: "u1" };
    query.maybeSingle.mockResolvedValueOnce({ data: row, error: null });

    const result = await getActivityBookingById(supabase, "b1");

    expect(supabase.from).toHaveBeenCalledWith("activity_bookings");
    expect(query.eq).toHaveBeenCalledWith("id", "b1");
    expect(result).toEqual(row);
  });

  it("getActivityBookingById: returns null when not found", async () => {
    const { supabase, query } = makeMockSupabaseForGetById();
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await getActivityBookingById(supabase, "missing");
    expect(result).toBeNull();
  });

  it("getActivityBookingById: error throws", async () => {
    const { supabase, query } = makeMockSupabaseForGetById();
    query.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "invalid input syntax for type uuid" },
    });

    await expect(getActivityBookingById(supabase, "b1")).rejects.toThrow(
      "Could not load activity booking by id: invalid input syntax for type uuid",
    );
  });

  it("cancelActivityBooking: RPC success", async () => {
    const { supabase } = makeMockSupabaseForCancel();
    supabase.rpc.mockResolvedValueOnce({ error: null });

    await cancelActivityBooking(supabase, "booking-uuid");

    expect(supabase.rpc).toHaveBeenCalledWith("cancel_activity_booking", {
      p_booking_id: "booking-uuid",
    });
  });

  it("cancelActivityBooking: RPC error throws", async () => {
    const { supabase } = makeMockSupabaseForCancel();
    supabase.rpc.mockResolvedValueOnce({
      error: { message: "Booking not found, not owned by caller, or not cancellable" },
    });

    await expect(cancelActivityBooking(supabase, "bad")).rejects.toThrow(
      "Could not cancel activity booking: Booking not found, not owned by caller, or not cancellable",
    );
  });

  it("cancelActivityBookingsForOrder: RPC success", async () => {
    const { supabase } = makeMockSupabaseForCancel();
    supabase.rpc.mockResolvedValueOnce({ error: null });

    await cancelActivityBookingsForOrder(supabase, "order-uuid");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "cancel_activity_bookings_for_order",
      { p_order_id: "order-uuid" },
    );
  });

  it("cancelActivityBookingsForOrder: RPC error throws", async () => {
    const { supabase } = makeMockSupabaseForCancel();
    supabase.rpc.mockResolvedValueOnce({
      error: { message: "order not found" },
    });

    await expect(
      cancelActivityBookingsForOrder(supabase, "bad-order"),
    ).rejects.toThrow(
      "Could not cancel activity bookings for order: order not found",
    );
  });
});
