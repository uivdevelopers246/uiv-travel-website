import { describe, it, expect, vi, beforeEach } from "vitest";

import { runPendingApprovalExpirySweep } from "./pending-approval-expiry";
import * as vendorApproval from "./vendor-approval";
import * as statusEmailHooks from "./status-email-hooks";
import * as activityBookingsService from "@/lib/activity-bookings/service";

vi.mock("./vendor-approval", async () => {
  const actual =
    await vi.importActual<typeof import("./vendor-approval")>(
      "./vendor-approval",
    );
  return {
    ...actual,
    syncOrderDeclinedWhenNoPendingHoldsRemain: vi.fn(),
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

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runPendingApprovalExpirySweep", () => {
  it("parses RPC jsonb, syncs returned orders, and emails only bookings that are now expired", async () => {
    vi.mocked(mockSupabase.from).mockReturnValue({
      select: () => ({
        eq: () => ({
          not: () => ({
            lte: () =>
              Promise.resolve({
                data: [{ id: "booking-1" }, { id: "booking-2" }, { id: "booking-3" }],
                error: null,
              }),
          }),
        }),
      }),
    } as never);
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: {
        expired_count: 3,
        order_ids: ["order-a", "order-b"],
      },
      error: null,
    });
    vi.mocked(activityBookingsService.getActivityBookingById)
      .mockResolvedValueOnce({ id: "booking-1", status: "expired" } as never)
      .mockResolvedValueOnce({ id: "booking-2", status: "pending_approval" } as never)
      .mockResolvedValueOnce({ id: "booking-3", status: "expired" } as never);

    const result = await runPendingApprovalExpirySweep(mockSupabase);

    expect(mockSupabase.rpc).toHaveBeenCalledWith("expire_pending_activity_bookings");
    expect(result).toEqual({
      expiredCount: 3,
      orderIdsSynced: ["order-a", "order-b"],
    });
    expect(
      vendorApproval.syncOrderDeclinedWhenNoPendingHoldsRemain,
    ).toHaveBeenCalledTimes(2);
    expect(
      vendorApproval.syncOrderDeclinedWhenNoPendingHoldsRemain,
    ).toHaveBeenCalledWith(mockSupabase, "order-a");
    expect(
      vendorApproval.syncOrderDeclinedWhenNoPendingHoldsRemain,
    ).toHaveBeenCalledWith(mockSupabase, "order-b");
    expect(activityBookingsService.getActivityBookingById).toHaveBeenCalledTimes(3);
    expect(statusEmailHooks.safeSendBookingStatusEmailHook).toHaveBeenCalledTimes(2);
    expect(statusEmailHooks.safeSendBookingStatusEmailHook).toHaveBeenCalledWith(
      mockSupabase,
      {
        bookingId: "booking-1",
        event: "booking_expired",
      },
    );
    expect(statusEmailHooks.safeSendBookingStatusEmailHook).toHaveBeenCalledWith(
      mockSupabase,
      {
        bookingId: "booking-3",
        event: "booking_expired",
      },
    );
  });

  it("does not call sync when order_ids is empty", async () => {
    vi.mocked(mockSupabase.from).mockReturnValue({
      select: () => ({
        eq: () => ({
          not: () => ({
            lte: () =>
              Promise.resolve({
                data: [],
                error: null,
              }),
          }),
        }),
      }),
    } as never);
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: { expired_count: 0, order_ids: [] },
      error: null,
    });

    const result = await runPendingApprovalExpirySweep(mockSupabase);

    expect(
      vendorApproval.syncOrderDeclinedWhenNoPendingHoldsRemain,
    ).not.toHaveBeenCalled();
    expect(statusEmailHooks.safeSendBookingStatusEmailHook).not.toHaveBeenCalled();
    expect(result).toEqual({ expiredCount: 0, orderIdsSynced: [] });
  });

  it("throws when RPC returns an error", async () => {
    vi.mocked(mockSupabase.from).mockReturnValue({
      select: () => ({
        eq: () => ({
          not: () => ({
            lte: () =>
              Promise.resolve({
                data: [],
                error: null,
              }),
          }),
        }),
      }),
    } as never);
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "rpc failed" } as never,
    });

    await expect(runPendingApprovalExpirySweep(mockSupabase)).rejects.toThrow(
      "expire_pending_activity_bookings failed: rpc failed",
    );
    expect(
      vendorApproval.syncOrderDeclinedWhenNoPendingHoldsRemain,
    ).not.toHaveBeenCalled();
  });

  it("throws when payload shape is invalid", async () => {
    vi.mocked(mockSupabase.from).mockReturnValue({
      select: () => ({
        eq: () => ({
          not: () => ({
            lte: () =>
              Promise.resolve({
                data: [],
                error: null,
              }),
          }),
        }),
      }),
    } as never);
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: { expired_count: "nope", order_ids: [] },
      error: null,
    });

    await expect(runPendingApprovalExpirySweep(mockSupabase)).rejects.toThrow(
      "expire_pending_activity_bookings returned invalid expired_count",
    );
    expect(
      vendorApproval.syncOrderDeclinedWhenNoPendingHoldsRemain,
    ).not.toHaveBeenCalled();
  });
});
