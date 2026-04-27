import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  declineActivityOrderAsAdmin,
  syncOrderDeclinedWhenNoPendingHoldsRemain,
} from "./vendor-approval";
import * as orderService from "./service";
import * as activityBookingsService from "@/lib/activity-bookings/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { tryBeginSettlementChargeForOrder } from "@/lib/orders/settlement";

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/orders/settlement", () => ({
  tryBeginSettlementChargeForOrder: vi.fn().mockResolvedValue(undefined),
}));

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
    declineAllPendingActivityBookingsForOrder: vi.fn().mockResolvedValue(undefined),
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

describe("declineActivityOrderAsAdmin", () => {
  const serviceStub = {} as never;
  const orderId = "order-admin-decline-1";

  beforeEach(() => {
    vi.mocked(createServiceRoleClient).mockReturnValue(serviceStub);
  });

  it("declines all pending rows then runs M4-C sync (settlement hook, no blanket order decline when a line stays confirmed)", async () => {
    vi.mocked(activityBookingsService.listActivityBookings).mockImplementation(
      async (_client, args) => {
        if (args.status === "pending_approval") {
          return [{ status: "pending_approval" }] as never;
        }
        return [{ status: "confirmed" }, { status: "declined" }] as never;
      },
    );
    vi.mocked(orderService.getOrderById).mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
    } as never);

    await declineActivityOrderAsAdmin(orderId);

    expect(
      activityBookingsService.declineAllPendingActivityBookingsForOrder,
    ).toHaveBeenCalledTimes(1);
    expect(
      activityBookingsService.declineAllPendingActivityBookingsForOrder,
    ).toHaveBeenCalledWith(serviceStub, orderId);
    expect(tryBeginSettlementChargeForOrder).toHaveBeenCalledTimes(1);
    expect(tryBeginSettlementChargeForOrder).toHaveBeenCalledWith(
      serviceStub,
      orderId,
    );
    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("throws when there are no pending approval bookings", async () => {
    vi.mocked(activityBookingsService.listActivityBookings).mockResolvedValue(
      [] as never,
    );

    await expect(declineActivityOrderAsAdmin(orderId)).rejects.toThrow(
      "No pending approval bookings for this order.",
    );

    expect(
      activityBookingsService.declineAllPendingActivityBookingsForOrder,
    ).not.toHaveBeenCalled();
    expect(tryBeginSettlementChargeForOrder).not.toHaveBeenCalled();
  });

  it("after bulk decline, sync may set order declined when every line is terminal non-confirmed", async () => {
    vi.mocked(activityBookingsService.listActivityBookings).mockImplementation(
      async (_client, args) => {
        if (args.status === "pending_approval") {
          return [{ status: "pending_approval" }] as never;
        }
        return [{ status: "declined" }, { status: "expired" }] as never;
      },
    );
    vi.mocked(orderService.getOrderById).mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
    } as never);

    await declineActivityOrderAsAdmin(orderId);

    expect(orderService.updateOrderStatus).toHaveBeenCalledWith(
      serviceStub,
      orderId,
      "declined",
    );
    expect(tryBeginSettlementChargeForOrder).toHaveBeenCalledWith(
      serviceStub,
      orderId,
    );
  });
});
