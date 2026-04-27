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

    await runPendingApprovalExpirySweep(mockSupabase);

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("expire_pending_activity_bookings");
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
});
