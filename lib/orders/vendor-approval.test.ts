import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  approveActivityBookingAsVendor,
  declineActivityOrderAsAdmin,
  syncOrderDeclinedWhenNoPendingHoldsRemain,
} from "./vendor-approval";
import * as orderService from "./service";
import * as activityBookingsService from "@/lib/activity-bookings/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { tryBeginSettlementChargeForOrder } from "@/lib/orders/settlement";
import { getVendorIdForCurrentUser } from "@/lib/vendors/ownership";
import { safeSendBookingStatusEmailHook } from "@/lib/orders/status-email-hooks";

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/orders/settlement", () => ({
  tryBeginSettlementChargeForOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/vendors/ownership", () => ({
  getVendorIdForCurrentUser: vi.fn(),
}));

vi.mock("@/lib/orders/status-email-hooks", () => ({
  safeSendBookingStatusEmailHook: vi.fn().mockResolvedValue(undefined),
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
    getActivityBookingById: vi.fn(),
    confirmPendingActivityBookingForVendor: vi.fn(),
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

describe("approveActivityBookingAsVendor", () => {
  const userSupabase = {} as never;
  const serviceStub = {} as never;

  beforeEach(() => {
    vi.mocked(orderService.getOrderById).mockReset();
    vi.mocked(createServiceRoleClient).mockReturnValue(serviceStub);
    vi.mocked(getVendorIdForCurrentUser).mockResolvedValue("vendor-1");
    vi.mocked(activityBookingsService.getActivityBookingById).mockResolvedValue({
      id: "booking-1",
      status: "pending_approval",
      vendor_id: "vendor-1",
      order_id: "order-1",
    } as never);
    vi.mocked(activityBookingsService.confirmPendingActivityBookingForVendor).mockResolvedValue(
      1,
    );
    vi.mocked(activityBookingsService.listActivityBookings).mockResolvedValue(
      [] as never,
    );
  });

  it("returns payment_failed and skips booking_confirmed notifications when settlement fails immediately", async () => {
    vi.mocked(orderService.getOrderById)
      .mockResolvedValueOnce({
        id: "order-1",
        status: "awaiting_vendor_approval",
      } as never)
      .mockResolvedValueOnce({
        id: "order-1",
        status: "awaiting_vendor_approval",
      } as never)
      .mockResolvedValueOnce({
        id: "order-1",
        status: "failed",
      } as never);

    const result = await approveActivityBookingAsVendor(userSupabase, "booking-1");

    expect(result).toEqual({ outcome: "payment_failed" });
    expect(
      activityBookingsService.confirmPendingActivityBookingForVendor,
    ).toHaveBeenCalledWith(serviceStub, "booking-1", "vendor-1");
    expect(tryBeginSettlementChargeForOrder).toHaveBeenCalledWith(
      serviceStub,
      "order-1",
    );
    expect(safeSendBookingStatusEmailHook).not.toHaveBeenCalled();
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
        if (args?.status === "pending_approval") {
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
        if (args?.status === "pending_approval") {
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
