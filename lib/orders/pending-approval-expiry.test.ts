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
  it("expires rows, then syncs declined for each distinct order (no settlement)", async () => {
    const listRows = {
      data: [
        { order_id: "order-a" },
        { order_id: "order-a" },
        { order_id: "order-b" },
      ],
      error: null,
    };
    vi.mocked(mockSupabase.from).mockReturnValue({
      select: () => ({
        eq: () => ({
          not: () => ({
            lte: () => ({
              not: () => Promise.resolve(listRows),
            }),
          }),
        }),
      }),
    } as never);
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: 3,
      error: null,
    });

    await runPendingApprovalExpirySweep(mockSupabase);

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
