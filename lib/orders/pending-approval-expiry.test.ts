import { describe, it, expect, vi, beforeEach } from "vitest";

import { runPendingApprovalExpirySweep } from "./pending-approval-expiry";
import * as vendorApproval from "./vendor-approval";

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

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runPendingApprovalExpirySweep", () => {
  it("parses RPC jsonb, then syncs declined per returned order_ids (no list query)", async () => {
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: {
        expired_count: 3,
        order_ids: ["order-a", "order-b"],
      },
      error: null,
    });

    const result = await runPendingApprovalExpirySweep(mockSupabase);

    expect(mockSupabase.from).not.toHaveBeenCalled();
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
  });

  it("does not call sync when order_ids is empty", async () => {
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: { expired_count: 0, order_ids: [] },
      error: null,
    });

    const result = await runPendingApprovalExpirySweep(mockSupabase);

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(
      vendorApproval.syncOrderDeclinedWhenNoPendingHoldsRemain,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({ expiredCount: 0, orderIdsSynced: [] });
  });

  it("throws when RPC returns an error", async () => {
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "rpc failed" } as never,
    });

    await expect(runPendingApprovalExpirySweep(mockSupabase)).rejects.toThrow(
      "expire_pending_activity_bookings failed: rpc failed",
    );
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(
      vendorApproval.syncOrderDeclinedWhenNoPendingHoldsRemain,
    ).not.toHaveBeenCalled();
  });

  it("throws when payload shape is invalid", async () => {
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
