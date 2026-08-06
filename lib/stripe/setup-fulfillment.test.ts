import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

import { CART_LINE_TYPE_ACTIVITY, CART_LINE_TYPE_ACCOMMODATION } from "@/lib/cart/constants";
import type { CartLine } from "@/lib/cart/types";
import type { Order } from "@/lib/orders/types";
import { STRIPE_METADATA_FLOW_M4C_SETUP } from "@/lib/orders/constants";

const activityBookingMocks = vi.hoisted(() => ({
  listActivityBookings: vi.fn(),
  createActivityBookingAfterPayment: vi.fn(),
  cancelActivityBookingsForOrder: vi.fn(),
  reopenConfirmedActivityBookingsForOrder: vi.fn(),
}));

const accommodationBookingMocks = vi.hoisted(() => ({
  listAccommodationBookings: vi.fn(),
  createAccommodationBookingAfterSetup: vi.fn(),
  cancelAccommodationBookingsForOrder: vi.fn(),
}));

const orderServiceMocks = vi.hoisted(() => ({
  getOrderById: vi.fn(),
  updateOrderStatus: vi.fn(),
  updateOrderAwaitingVendorApprovalFromSetup: vi.fn(),
  revertOrderToAwaitingPaymentAfterSetupFailure: vi.fn(),
}));

const cartServiceMocks = vi.hoisted(() => ({
  deleteAllCartLinesForUser: vi.fn(),
}));

const providerNoticeMocks = vi.hoisted(() => ({
  safeSendProviderBookingPendingNotice: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent: vi.fn() };
  },
}));

vi.mock("@/lib/activity-bookings/service", () => ({
  listActivityBookings: activityBookingMocks.listActivityBookings,
  createActivityBookingAfterPayment:
    activityBookingMocks.createActivityBookingAfterPayment,
  cancelActivityBookingsForOrder: activityBookingMocks.cancelActivityBookingsForOrder,
  reopenConfirmedActivityBookingsForOrder:
    activityBookingMocks.reopenConfirmedActivityBookingsForOrder,
}));

vi.mock("@/lib/accommodation-bookings/service", () => ({
  listAccommodationBookings: accommodationBookingMocks.listAccommodationBookings,
  createAccommodationBookingAfterSetup:
    accommodationBookingMocks.createAccommodationBookingAfterSetup,
  cancelAccommodationBookingsForOrder:
    accommodationBookingMocks.cancelAccommodationBookingsForOrder,
}));

vi.mock("@/lib/orders/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orders/service")>();
  return {
    ...actual,
    getOrderById: orderServiceMocks.getOrderById,
    updateOrderStatus: orderServiceMocks.updateOrderStatus,
    updateOrderAwaitingVendorApprovalFromSetup:
      orderServiceMocks.updateOrderAwaitingVendorApprovalFromSetup,
    revertOrderToAwaitingPaymentAfterSetupFailure:
      orderServiceMocks.revertOrderToAwaitingPaymentAfterSetupFailure,
  };
});

vi.mock("@/lib/cart/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cart/service")>();
  return {
    ...actual,
    deleteAllCartLinesForUser: cartServiceMocks.deleteAllCartLinesForUser,
  };
});

vi.mock("@/lib/notifications/provider-notices", () => providerNoticeMocks);

import { fulfillCheckoutSetupSessionCompleted } from "./server";

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    user_id: "user-1",
    status: "awaiting_payment",
    currency: "usd",
    subtotal_cents: 55000,
    discount_cents: 0,
    total_cents: 55000,
    stripe_checkout_session_id: "cs_1",
    stripe_payment_intent_id: null,
    stripe_customer_id: null,
    stripe_setup_intent_id: null,
    settlement_charge_attempt_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function activityLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: "line-act",
    user_id: "user-1",
    line_type: CART_LINE_TYPE_ACTIVITY,
    slot_id: "slot-1",
    participants: 2,
    unit_price_cents: 5000,
    line_subtotal_cents: 10000,
    line_discount_cents: 0,
    line_total_cents: 10000,
    accommodation_id: null,
    check_in: null,
    check_out: null,
    guests: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function accommodationLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: "line-stay",
    user_id: "user-1",
    line_type: CART_LINE_TYPE_ACCOMMODATION,
    slot_id: null,
    participants: null,
    unit_price_cents: 15000,
    line_subtotal_cents: 45000,
    line_discount_cents: 0,
    line_total_cents: 45000,
    accommodation_id: "acc-1",
    check_in: "2026-08-01",
    check_out: "2026-08-04",
    guests: 2,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function checkoutSessionCompletedEvent(): Stripe.Event {
  return {
    id: "evt_setup_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        mode: "setup",
        metadata: { order_id: "order-1", flow: STRIPE_METADATA_FLOW_M4C_SETUP },
        setup_intent: "seti_1",
        customer: "cus_1",
      } as Stripe.Checkout.Session,
    },
  } as Stripe.Event;
}

/**
 * Builds a supabase mock for setup fulfillment: idempotency miss, cart lines,
 * optional slots/accommodations lookups, cart delete, webhook insert.
 */
function makeSetupFulfillmentSupabase(input: {
  cartLines: CartLine[];
  slots?: Array<{
    id: string;
    activity_id: string;
    vendor_id: string;
  }>;
  accommodations?: Array<{ id: string; vendor_id: string }>;
}) {
  const tablesCalled: string[] = [];
  let cartSelectCount = 0;

  return {
    tablesCalled,
    supabase: {
      from: vi.fn((table: string) => {
        tablesCalled.push(table);

        if (table === "stripe_webhook_events") {
          const isLookup = tablesCalled.filter((t) => t === "stripe_webhook_events").length === 1;
          if (isLookup) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        if (table === "cart_lines") {
          cartSelectCount += 1;
          if (cartSelectCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: input.cartLines,
                error: null,
              }),
            };
          }
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        if (table === "availability_slots") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: input.slots ?? [],
              error: null,
            }),
          };
        }

        if (table === "accommodations") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: input.accommodations ?? [],
              error: null,
            }),
          };
        }

        throw new Error(`Unexpected from(${table})`);
      }),
    },
  };
}

describe("fulfillCheckoutSetupSessionCompleted (mixed cart stays)", () => {
  beforeEach(() => {
    activityBookingMocks.listActivityBookings.mockReset();
    activityBookingMocks.createActivityBookingAfterPayment.mockReset();
    activityBookingMocks.cancelActivityBookingsForOrder.mockReset();
    accommodationBookingMocks.listAccommodationBookings.mockReset();
    accommodationBookingMocks.createAccommodationBookingAfterSetup.mockReset();
    accommodationBookingMocks.cancelAccommodationBookingsForOrder.mockReset();
    orderServiceMocks.getOrderById.mockReset();
    orderServiceMocks.updateOrderAwaitingVendorApprovalFromSetup.mockReset();
    orderServiceMocks.revertOrderToAwaitingPaymentAfterSetupFailure.mockReset();
    cartServiceMocks.deleteAllCartLinesForUser.mockReset();
    providerNoticeMocks.safeSendProviderBookingPendingNotice.mockReset();

    activityBookingMocks.listActivityBookings.mockResolvedValue([]);
    accommodationBookingMocks.listAccommodationBookings.mockResolvedValue([]);
    activityBookingMocks.cancelActivityBookingsForOrder.mockResolvedValue(undefined);
    accommodationBookingMocks.cancelAccommodationBookingsForOrder.mockResolvedValue(
      undefined,
    );
    cartServiceMocks.deleteAllCartLinesForUser.mockResolvedValue(undefined);
    providerNoticeMocks.safeSendProviderBookingPendingNotice.mockResolvedValue(
      undefined,
    );
    orderServiceMocks.updateOrderAwaitingVendorApprovalFromSetup.mockResolvedValue(
      true,
    );
    orderServiceMocks.revertOrderToAwaitingPaymentAfterSetupFailure.mockResolvedValue(
      undefined,
    );
  });

  it("creates pending_approval activity and accommodation bookings for a mixed cart", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue(baseOrder());
    activityBookingMocks.createActivityBookingAfterPayment.mockResolvedValue({
      id: "ab-1",
      order_id: "order-1",
      slot_id: "slot-1",
      status: "pending_approval",
    });
    accommodationBookingMocks.createAccommodationBookingAfterSetup.mockResolvedValue({
      id: "stay-1",
      order_id: "order-1",
      accommodation_id: "acc-1",
      check_in: "2026-08-01",
      check_out: "2026-08-04",
      status: "pending_approval",
    });

    const { supabase, tablesCalled } = makeSetupFulfillmentSupabase({
      cartLines: [activityLine(), accommodationLine()],
      slots: [{ id: "slot-1", activity_id: "act-1", vendor_id: "vendor-act" }],
      accommodations: [{ id: "acc-1", vendor_id: "vendor-stay" }],
    });

    const result = await fulfillCheckoutSetupSessionCompleted(
      checkoutSessionCompletedEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "success" });
    expect(activityBookingMocks.createActivityBookingAfterPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        slot_id: "slot-1",
        order_id: "order-1",
        participants: 2,
        status: "pending_approval",
        expires_at: expect.any(String),
      }),
    );
    expect(
      accommodationBookingMocks.createAccommodationBookingAfterSetup,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accommodation_id: "acc-1",
        vendor_id: "vendor-stay",
        order_id: "order-1",
        check_in: "2026-08-01",
        check_out: "2026-08-04",
        guests: 2,
        unit_price_cents: 15000,
        subtotal_cents: 45000,
        total_cents: 45000,
        status: "pending_approval",
        expires_at: expect.any(String),
      }),
    );
    expect(cartServiceMocks.deleteAllCartLinesForUser).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
    );
    expect(providerNoticeMocks.safeSendProviderBookingPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      "ab-1",
    );
    expect(providerNoticeMocks.safeSendProviderBookingPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      "stay-1",
      "accommodation",
    );
    expect(tablesCalled).toContain("stripe_webhook_events");
  });

  it("creates accommodation bookings for stay-only carts", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue(
      baseOrder({ total_cents: 45000, subtotal_cents: 45000 }),
    );
    accommodationBookingMocks.createAccommodationBookingAfterSetup.mockResolvedValue({
      id: "stay-1",
      order_id: "order-1",
      accommodation_id: "acc-1",
      check_in: "2026-08-01",
      check_out: "2026-08-04",
      status: "pending_approval",
    });

    const { supabase } = makeSetupFulfillmentSupabase({
      cartLines: [accommodationLine()],
      accommodations: [{ id: "acc-1", vendor_id: "vendor-stay" }],
    });

    const result = await fulfillCheckoutSetupSessionCompleted(
      checkoutSessionCompletedEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "success" });
    expect(activityBookingMocks.createActivityBookingAfterPayment).not.toHaveBeenCalled();
    expect(
      accommodationBookingMocks.createAccommodationBookingAfterSetup,
    ).toHaveBeenCalledTimes(1);
    expect(providerNoticeMocks.safeSendProviderBookingPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      "stay-1",
      "accommodation",
    );
    expect(cartServiceMocks.deleteAllCartLinesForUser).toHaveBeenCalled();
  });

  it("compensates both booking kinds and keeps the cart on partial failure", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue(baseOrder());
    activityBookingMocks.createActivityBookingAfterPayment.mockResolvedValue({
      id: "ab-1",
      order_id: "order-1",
      slot_id: "slot-1",
      status: "pending_approval",
    });
    accommodationBookingMocks.createAccommodationBookingAfterSetup.mockRejectedValue(
      new Error("Stay dates overlap an existing booking"),
    );

    const { supabase } = makeSetupFulfillmentSupabase({
      cartLines: [activityLine(), accommodationLine()],
      slots: [{ id: "slot-1", activity_id: "act-1", vendor_id: "vendor-act" }],
      accommodations: [{ id: "acc-1", vendor_id: "vendor-stay" }],
    });

    const result = await fulfillCheckoutSetupSessionCompleted(
      checkoutSessionCompletedEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "partial_failure_rolled_back" });
    expect(activityBookingMocks.cancelActivityBookingsForOrder).toHaveBeenCalledWith(
      expect.anything(),
      "order-1",
    );
    expect(
      accommodationBookingMocks.cancelAccommodationBookingsForOrder,
    ).toHaveBeenCalledWith(expect.anything(), "order-1");
    expect(
      orderServiceMocks.revertOrderToAwaitingPaymentAfterSetupFailure,
    ).toHaveBeenCalledWith(expect.anything(), "order-1");
    expect(cartServiceMocks.deleteAllCartLinesForUser).not.toHaveBeenCalled();
  });

  it("skips create when pending stays already cover accommodation cart lines", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue(
      baseOrder({
        status: "awaiting_vendor_approval",
        stripe_setup_intent_id: "seti_1",
        stripe_customer_id: "cus_1",
      }),
    );
    accommodationBookingMocks.listAccommodationBookings.mockResolvedValue([
      {
        id: "stay-1",
        order_id: "order-1",
        accommodation_id: "acc-1",
        check_in: "2026-08-01",
        check_out: "2026-08-04",
        status: "pending_approval",
      },
    ]);

    const { supabase } = makeSetupFulfillmentSupabase({
      cartLines: [accommodationLine()],
    });

    const result = await fulfillCheckoutSetupSessionCompleted(
      checkoutSessionCompletedEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "already_fulfilled" });
    expect(
      accommodationBookingMocks.createAccommodationBookingAfterSetup,
    ).not.toHaveBeenCalled();
    expect(cartServiceMocks.deleteAllCartLinesForUser).toHaveBeenCalled();
  });
});
