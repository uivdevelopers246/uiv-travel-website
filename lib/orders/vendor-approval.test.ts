import { describe, it, expect, vi, beforeEach } from "vitest";

import { syncOrderDeclinedWhenNoPendingHoldsRemain } from "./vendor-approval";
import * as orderService from "./service";
import * as activityBookingsService from "@/lib/activity-bookings/service";

vi.mock("./service", async () => {
  const actual = await vi.importActual<typeof import("./service")>("./service");
  return {
    ...actual,
    getOrderById: vi.fn(),
    updateOrderStatus: vi.fn(),
  };
});

vi.mock("@/lib/activity-bookings/service", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/activity-bookings/service")>(
      "@/lib/activity-bookings/service",
    );
  return {
    ...actual,
    listActivityBookings: vi.fn(),
  };
});

const mockSupabase = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncOrderDeclinedWhenNoPendingHoldsRemain", () => {
  it("sets order to declined when no pending rows and all bookings are terminal", async () => {
    vi.mocked(orderService.getOrderById).mockResolvedValue({
      id: "order-1",
      status: "awaiting_vendor_approval",
    } as never);
    vi.mocked(activityBookingsService.listActivityBookings).mockResolvedValue([
      { status: "declined" },
      { status: "declined" },
    ] as never);

    await syncOrderDeclinedWhenNoPendingHoldsRemain(mockSupabase, "order-1");

    expect(orderService.updateOrderStatus).toHaveBeenCalledWith(
      mockSupabase,
      "order-1",
      "declined",
    );
  });

  it("does nothing when pending_approval rows remain", async () => {
    vi.mocked(orderService.getOrderById).mockResolvedValue({
      id: "order-1",
      status: "awaiting_vendor_approval",
    } as never);
    vi.mocked(activityBookingsService.listActivityBookings).mockResolvedValue([
      { status: "pending_approval" },
    ] as never);

    await syncOrderDeclinedWhenNoPendingHoldsRemain(mockSupabase, "order-1");

    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
  });
});
