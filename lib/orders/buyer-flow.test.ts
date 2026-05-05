import { describe, expect, it } from "vitest";

import {
  getBuyerFlowMessageFromSearchParams,
  getCheckoutSuccessState,
} from "./buyer-flow";
import type { OrderWithActivityBookingsPaymentPreview } from "./types";

function makeOrder(
  overrides: Partial<OrderWithActivityBookingsPaymentPreview> = {},
): OrderWithActivityBookingsPaymentPreview {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "user-1",
    status: "awaiting_vendor_approval",
    currency: "usd",
    subtotal_cents: 10000,
    discount_cents: 0,
    total_cents: 10000,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    stripe_customer_id: null,
    stripe_setup_intent_id: null,
    settlement_charge_attempt_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    payment_summary: null,
    activity_bookings: [
      {
        id: "booking-1",
        activity_id: "activity-1",
        activity_title: "Island Sail",
        activity_image_url: "https://example.com/island-sail.jpg",
        approval_deadline_at: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        discount_cents: 0,
        expires_at: "2026-01-02T00:00:00.000Z",
        order_id: "11111111-1111-1111-1111-111111111111",
        participants: 2,
        slot_id: "slot-1",
        slot_starts_at: "2026-01-10T14:00:00.000Z",
        slot_ends_at: "2026-01-10T16:00:00.000Z",
        status: "pending_approval",
        subtotal_cents: 10000,
        total_cents: 10000,
        unit_price_cents: 5000,
        updated_at: "2026-01-01T00:00:00.000Z",
        user_id: "user-1",
        vendor_id: "vendor-1",
      },
    ],
    ...overrides,
  };
}

describe("getBuyerFlowMessageFromSearchParams", () => {
  it("maps checkout success to a success banner", () => {
    expect(
      getBuyerFlowMessageFromSearchParams(new URLSearchParams("checkout=success")),
    ).toEqual({
      tone: "success",
      message:
        "Your payment method was saved and your booking request is now in vendor review.",
    });
  });

  it("maps payment recovery cancellation to a warning banner", () => {
    expect(
      getBuyerFlowMessageFromSearchParams(
        new URLSearchParams("payment_recovery=cancelled"),
      ),
    ).toEqual({
      tone: "warning",
      message:
        "Payment method update was canceled. Confirmed bookings will stay unpaid until you retry.",
    });
  });
});

describe("getCheckoutSuccessState", () => {
  it("returns finalizing while the order is still awaiting booking rows", () => {
    const order = makeOrder({
      status: "awaiting_payment",
      activity_bookings: [],
    });

    expect(
      getCheckoutSuccessState(
        "11111111-1111-1111-1111-111111111111",
        order,
      ).kind,
    ).toBe("finalizing");
  });

  it("returns submitted when the booking request is ready for vendor review", () => {
    expect(
      getCheckoutSuccessState(
        "11111111-1111-1111-1111-111111111111",
        makeOrder(),
      ).kind,
    ).toBe("submitted");
  });

  it("returns attention for reconciliation-required orders", () => {
    expect(
      getCheckoutSuccessState(
        "11111111-1111-1111-1111-111111111111",
        makeOrder({
          status: "reconciliation_required",
        }),
      ).kind,
    ).toBe("attention");
  });
});
