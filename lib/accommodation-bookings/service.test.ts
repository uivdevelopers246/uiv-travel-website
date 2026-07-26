import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import {
  cancelAccommodationBookingsForOrder,
  createAccommodationBookingAfterSetup,
  listAccommodationBookings,
} from "./service";

type MockSupabase<T extends object> = SupabaseClient<Database> & T;

type RpcSupabaseMock = {
  rpc: Mock;
};

type FromSupabaseMock<TQuery> = {
  from: Mock<() => TQuery>;
};

type ListBookingsQueryMock = {
  select: Mock;
  eq: Mock;
  order: Mock;
  range: Mock;
};

function asSupabase<T extends object>(value: T): MockSupabase<T> {
  return value as unknown as MockSupabase<T>;
}

function makeMockSupabaseForRpc() {
  return asSupabase<RpcSupabaseMock>({
    rpc: vi.fn(),
  });
}

function makeMockSupabaseForListBookings() {
  const query: ListBookingsQueryMock = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(),
  };
  const supabase = asSupabase<FromSupabaseMock<ListBookingsQueryMock>>({
    from: vi.fn(() => query),
  });
  return { supabase, query };
}

const baseCreateInput = {
  accommodation_id: "acc-1",
  user_id: "user-1",
  vendor_id: "vendor-1",
  order_id: "order-1",
  check_in: "2026-08-01",
  check_out: "2026-08-04",
  guests: 2,
  unit_price_cents: 15000,
  subtotal_cents: 45000,
  total_cents: 45000,
};

describe("accommodation-bookings service", () => {
  it("createAccommodationBookingAfterSetup: atomic RPC returns row", async () => {
    const supabase = makeMockSupabaseForRpc();
    const inserted = {
      ...baseCreateInput,
      id: "stay-1",
      status: "pending_approval",
      discount_cents: 0,
      expires_at: "2026-07-27T00:00:00.000Z",
      created_at: "t0",
      updated_at: "t0",
    };
    supabase.rpc.mockResolvedValueOnce({ data: inserted, error: null });

    const row = await createAccommodationBookingAfterSetup(supabase, {
      ...baseCreateInput,
      status: "pending_approval",
      expires_at: "2026-07-27T00:00:00.000Z",
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_accommodation_booking_after_setup",
      {
        p_accommodation_id: "acc-1",
        p_user_id: "user-1",
        p_vendor_id: "vendor-1",
        p_order_id: "order-1",
        p_check_in: "2026-08-01",
        p_check_out: "2026-08-04",
        p_guests: 2,
        p_unit_price_cents: 15000,
        p_subtotal_cents: 45000,
        p_discount_cents: 0,
        p_total_cents: 45000,
        p_status: "pending_approval",
        p_expires_at: "2026-07-27T00:00:00.000Z",
      },
    );
    expect(row).toEqual(inserted);
  });

  it("createAccommodationBookingAfterSetup: defaults status to pending_approval", async () => {
    const supabase = makeMockSupabaseForRpc();
    supabase.rpc.mockResolvedValueOnce({
      data: { id: "stay-1", status: "pending_approval" },
      error: null,
    });

    await createAccommodationBookingAfterSetup(supabase, baseCreateInput);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_accommodation_booking_after_setup",
      expect.objectContaining({
        p_status: "pending_approval",
        p_expires_at: null,
        p_discount_cents: 0,
      }),
    );
  });

  it("createAccommodationBookingAfterSetup: RPC error throws", async () => {
    const supabase = makeMockSupabaseForRpc();
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Stay dates overlap an existing booking" },
    });

    await expect(
      createAccommodationBookingAfterSetup(supabase, baseCreateInput),
    ).rejects.toThrow(
      "Could not create accommodation booking after setup: Stay dates overlap an existing booking",
    );
  });

  it("createAccommodationBookingAfterSetup: RPC success but no data throws", async () => {
    const supabase = makeMockSupabaseForRpc();
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      createAccommodationBookingAfterSetup(supabase, baseCreateInput),
    ).rejects.toThrow(
      "Accommodation booking was not created: create_accommodation_booking_after_setup returned no row.",
    );
  });

  it("listAccommodationBookings: returns data and applies filters", async () => {
    const { supabase, query } = makeMockSupabaseForListBookings();
    query.range.mockResolvedValueOnce({ data: [{ id: "stay-1" }], error: null });

    const result = await listAccommodationBookings(supabase, {
      orderId: "order-1",
      accommodationId: "acc-1",
      userId: "user-1",
      vendorId: "vendor-1",
      status: "pending_approval",
      limit: 20,
      offset: 5,
    });

    expect(supabase.from).toHaveBeenCalledWith("accommodation_bookings");
    expect(query.eq).toHaveBeenCalledWith("order_id", "order-1");
    expect(query.eq).toHaveBeenCalledWith("accommodation_id", "acc-1");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.eq).toHaveBeenCalledWith("vendor_id", "vendor-1");
    expect(query.eq).toHaveBeenCalledWith("status", "pending_approval");
    expect(query.range).toHaveBeenCalledWith(5, 24);
    expect(result).toEqual([{ id: "stay-1" }]);
  });

  it("listAccommodationBookings: empty data becomes []", async () => {
    const { supabase, query } = makeMockSupabaseForListBookings();
    query.range.mockResolvedValueOnce({ data: null, error: null });

    const result = await listAccommodationBookings(supabase);
    expect(result).toEqual([]);
  });

  it("listAccommodationBookings: query error throws", async () => {
    const { supabase, query } = makeMockSupabaseForListBookings();
    query.range.mockResolvedValueOnce({
      data: null,
      error: { message: "db down" },
    });

    await expect(listAccommodationBookings(supabase)).rejects.toThrow(
      "Could not list accommodation bookings: db down",
    );
  });

  it("cancelAccommodationBookingsForOrder: RPC success", async () => {
    const supabase = makeMockSupabaseForRpc();
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    await cancelAccommodationBookingsForOrder(supabase, "order-uuid");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "cancel_accommodation_bookings_for_order",
      { p_order_id: "order-uuid" },
    );
  });

  it("cancelAccommodationBookingsForOrder: RPC error throws", async () => {
    const supabase = makeMockSupabaseForRpc();
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(
      cancelAccommodationBookingsForOrder(supabase, "bad-order"),
    ).rejects.toThrow(
      "Could not cancel accommodation bookings for order: permission denied",
    );
  });
});
