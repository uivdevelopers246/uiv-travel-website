import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";
import { runPendingApprovalExpirySweep } from "./pending-approval-expiry";
import * as vendorApproval from "./vendor-approval";
import * as statusEmailHooks from "./status-email-hooks";
import * as activityBookingsService from "@/lib/activity-bookings/service";
import * as accommodationBookingsService from "@/lib/accommodation-bookings/service";

// Same post-transition hook as vendor approve/decline (decline sync + settlement start).
vi.mock("./vendor-approval", async () => {
  const actual =
    await vi.importActual<typeof import("./vendor-approval")>(
      "./vendor-approval",
    );
  return {
    ...actual,
    syncOrderM4cAfterBookingChange: vi.fn(),
  };
});

vi.mock("./status-email-hooks", async () => {
  const actual =
    await vi.importActual<typeof import("./status-email-hooks")>(
      "./status-email-hooks",
    );
  return {
    ...actual,
    safeSendBookingStatusEmailHook: vi.fn(),
  };
});

vi.mock("@/lib/activity-bookings/service", () => ({
  getActivityBookingById: vi.fn(),
}));

vi.mock("@/lib/accommodation-bookings/service", () => ({
  getAccommodationBookingById: vi.fn(),
}));

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
} as unknown as SupabaseClient<Database> & {
  from: Mock;
  rpc: Mock;
};

function mockPastSlaQuery(ids: string[]) {
  return {
    select: () => ({
      eq: () => ({
        not: () => ({
          lte: () =>
            Promise.resolve({
              data: ids.map((id) => ({ id })),
              error: null,
            }),
        }),
      }),
    }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runPendingApprovalExpirySweep", () => {
  it("parses both RPC payloads, syncs union of orders, and emails expired activity + stay rows", async () => {
    vi.mocked(mockSupabase.from).mockImplementation((table: string) => {
      if (table === "activity_bookings") {
        return mockPastSlaQuery(["booking-1", "booking-2", "booking-3"]);
      }
      if (table === "accommodation_bookings") {
        return mockPastSlaQuery(["stay-1", "stay-2"]);
      }
      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(mockSupabase.rpc)
      .mockResolvedValueOnce({
        data: {
          expired_count: 3,
          order_ids: ["order-a", "order-b"],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          expired_count: 2,
          order_ids: ["order-b", "order-c"],
        },
        error: null,
      });
    vi.mocked(activityBookingsService.getActivityBookingById)
      .mockResolvedValueOnce({ id: "booking-1", status: "expired" } as never)
      .mockResolvedValueOnce({ id: "booking-2", status: "pending_approval" } as never)
      .mockResolvedValueOnce({ id: "booking-3", status: "expired" } as never);
    vi.mocked(accommodationBookingsService.getAccommodationBookingById)
      .mockResolvedValueOnce({ id: "stay-1", status: "expired" } as never)
      .mockResolvedValueOnce({ id: "stay-2", status: "expired" } as never);

    const result = await runPendingApprovalExpirySweep(mockSupabase);

    expect(mockSupabase.rpc).toHaveBeenNthCalledWith(
      1,
      "expire_pending_activity_bookings",
    );
    expect(mockSupabase.rpc).toHaveBeenNthCalledWith(
      2,
      "expire_pending_accommodation_bookings",
    );
    expect(result).toEqual({
      expiredCount: 5,
      orderIdsSynced: ["order-a", "order-b", "order-c"],
    });
    expect(
      vendorApproval.syncOrderM4cAfterBookingChange,
    ).toHaveBeenCalledTimes(3);
    expect(
      vendorApproval.syncOrderM4cAfterBookingChange,
    ).toHaveBeenCalledWith(mockSupabase, "order-a");
    expect(
      vendorApproval.syncOrderM4cAfterBookingChange,
    ).toHaveBeenCalledWith(mockSupabase, "order-b");
    expect(
      vendorApproval.syncOrderM4cAfterBookingChange,
    ).toHaveBeenCalledWith(mockSupabase, "order-c");
    expect(statusEmailHooks.safeSendBookingStatusEmailHook).toHaveBeenCalledTimes(4);
    expect(statusEmailHooks.safeSendBookingStatusEmailHook).toHaveBeenCalledWith(
      mockSupabase,
      {
        bookingId: "booking-1",
        event: "booking_expired",
        lineType: "activity",
      },
    );
    expect(statusEmailHooks.safeSendBookingStatusEmailHook).toHaveBeenCalledWith(
      mockSupabase,
      {
        bookingId: "stay-1",
        event: "booking_expired",
        lineType: "accommodation",
      },
    );
  });

  it("does not call sync when both order_ids lists are empty", async () => {
    vi.mocked(mockSupabase.from).mockImplementation(() => mockPastSlaQuery([]));
    vi.mocked(mockSupabase.rpc)
      .mockResolvedValueOnce({
        data: { expired_count: 0, order_ids: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { expired_count: 0, order_ids: [] },
        error: null,
      });

    const result = await runPendingApprovalExpirySweep(mockSupabase);

    expect(
      vendorApproval.syncOrderM4cAfterBookingChange,
    ).not.toHaveBeenCalled();
    expect(statusEmailHooks.safeSendBookingStatusEmailHook).not.toHaveBeenCalled();
    expect(result).toEqual({ expiredCount: 0, orderIdsSynced: [] });
  });

  it("throws when activity RPC returns an error", async () => {
    vi.mocked(mockSupabase.from).mockImplementation(() => mockPastSlaQuery([]));
    vi.mocked(mockSupabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "rpc failed" } as never,
    });

    await expect(runPendingApprovalExpirySweep(mockSupabase)).rejects.toThrow(
      "expire_pending_activity_bookings failed: rpc failed",
    );
    expect(
      vendorApproval.syncOrderM4cAfterBookingChange,
    ).not.toHaveBeenCalled();
  });

  it("throws when accommodation payload shape is invalid", async () => {
    vi.mocked(mockSupabase.from).mockImplementation(() => mockPastSlaQuery([]));
    vi.mocked(mockSupabase.rpc)
      .mockResolvedValueOnce({
        data: { expired_count: 0, order_ids: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { expired_count: "nope", order_ids: [] },
        error: null,
      });

    await expect(runPendingApprovalExpirySweep(mockSupabase)).rejects.toThrow(
      "expire_pending_accommodation_bookings returned invalid expired_count",
    );
    expect(
      vendorApproval.syncOrderM4cAfterBookingChange,
    ).not.toHaveBeenCalled();
  });
});
