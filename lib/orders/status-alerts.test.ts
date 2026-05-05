import { describe, expect, it } from "vitest";

import type { OrderWithActivityBookingsPreview } from "./types";
import { collectOrderStatusAlerts } from "./status-alerts";

function makeOrder(
  overrides: Partial<OrderWithActivityBookingsPreview> = {},
): OrderWithActivityBookingsPreview {
  return {
    id: "order-1",
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
    activity_bookings: [],
    ...overrides,
  };
}

describe("collectOrderStatusAlerts", () => {
  it("returns no alerts for an initial load snapshot", () => {
    const nextOrders = [
      makeOrder({
        activity_bookings: [
          {
            id: "booking-1",
            activity_id: "activity-1",
            activity_title: "Sailing",
            activity_image_url: "https://example.com/sailing.jpg",
            approval_deadline_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
            discount_cents: 0,
            expires_at: null,
            order_id: "order-1",
            participants: 2,
            slot_id: "slot-1",
            slot_starts_at: "2026-01-02T15:00:00.000Z",
            slot_ends_at: "2026-01-02T17:00:00.000Z",
            status: "confirmed",
            subtotal_cents: 10000,
            total_cents: 10000,
            unit_price_cents: 5000,
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "user-1",
            vendor_id: "vendor-1",
          },
        ],
      }),
    ];

    expect(collectOrderStatusAlerts([], nextOrders)).toEqual([]);
  });

  it("collects booking and payment transition alerts", () => {
    const previousOrders = [
      makeOrder({
        status: "payment_pending",
        activity_bookings: [
          {
            id: "booking-1",
            activity_id: "activity-1",
            activity_title: "Sailing",
            activity_image_url: "https://example.com/sailing.jpg",
            approval_deadline_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
            discount_cents: 0,
            expires_at: null,
            order_id: "order-1",
            participants: 2,
            slot_id: "slot-1",
            slot_starts_at: "2026-01-02T15:00:00.000Z",
            slot_ends_at: "2026-01-02T17:00:00.000Z",
            status: "pending_approval",
            subtotal_cents: 10000,
            total_cents: 10000,
            unit_price_cents: 5000,
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "user-1",
            vendor_id: "vendor-1",
          },
          {
            id: "booking-2",
            activity_id: "activity-2",
            activity_title: "Snorkeling",
            activity_image_url: "https://example.com/snorkeling.jpg",
            approval_deadline_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
            discount_cents: 0,
            expires_at: null,
            order_id: "order-1",
            participants: 1,
            slot_id: "slot-2",
            slot_starts_at: "2026-01-03T15:00:00.000Z",
            slot_ends_at: "2026-01-03T17:00:00.000Z",
            status: "pending_approval",
            subtotal_cents: 5000,
            total_cents: 5000,
            unit_price_cents: 5000,
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "user-1",
            vendor_id: "vendor-2",
          },
        ],
      }),
    ];

    const nextOrders = [
      makeOrder({
        status: "paid",
        activity_bookings: [
          { ...previousOrders[0].activity_bookings[0], status: "confirmed" },
          { ...previousOrders[0].activity_bookings[1], status: "declined" },
        ],
      }),
    ];

    expect(collectOrderStatusAlerts(previousOrders, nextOrders)).toEqual([
      {
        tone: "success",
        message: "Your booking was confirmed by the vendor.",
      },
      {
        tone: "warning",
        message: "A vendor declined your booking.",
      },
      {
        tone: "success",
        message: "Payment completed successfully.",
      },
    ]);
  });

  it("aggregates expired and failed payment alerts", () => {
    const previousOrders = [
      makeOrder({
        status: "payment_pending",
        activity_bookings: [
          {
            id: "booking-1",
            activity_id: "activity-1",
            activity_title: "Sailing",
            activity_image_url: "https://example.com/sailing.jpg",
            approval_deadline_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
            discount_cents: 0,
            expires_at: null,
            order_id: "order-1",
            participants: 2,
            slot_id: "slot-1",
            slot_starts_at: "2026-01-02T15:00:00.000Z",
            slot_ends_at: "2026-01-02T17:00:00.000Z",
            status: "pending_approval",
            subtotal_cents: 10000,
            total_cents: 10000,
            unit_price_cents: 5000,
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "user-1",
            vendor_id: "vendor-1",
          },
          {
            id: "booking-2",
            activity_id: "activity-2",
            activity_title: "Snorkeling",
            activity_image_url: "https://example.com/snorkeling.jpg",
            approval_deadline_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
            discount_cents: 0,
            expires_at: null,
            order_id: "order-1",
            participants: 1,
            slot_id: "slot-2",
            slot_starts_at: "2026-01-03T15:00:00.000Z",
            slot_ends_at: "2026-01-03T17:00:00.000Z",
            status: "pending_approval",
            subtotal_cents: 5000,
            total_cents: 5000,
            unit_price_cents: 5000,
            updated_at: "2026-01-01T00:00:00.000Z",
            user_id: "user-1",
            vendor_id: "vendor-2",
          },
        ],
      }),
    ];

    const nextOrders = [
      makeOrder({
        status: "failed",
        activity_bookings: previousOrders[0].activity_bookings.map((booking) => ({
          ...booking,
          status: "expired",
        })),
      }),
    ];

    expect(collectOrderStatusAlerts(previousOrders, nextOrders)).toEqual([
      {
        tone: "warning",
        message: "2 bookings expired after the vendor response window closed.",
      },
      {
        tone: "error",
        message: "Payment failed. Please retry or contact support.",
      },
    ]);
  });

  it("alerts when an order moves into reconciliation review", () => {
    const previousOrders = [
      makeOrder({
        status: "payment_pending",
      }),
    ];

    const nextOrders = [
      makeOrder({
        status: "reconciliation_required",
      }),
    ];

    expect(collectOrderStatusAlerts(previousOrders, nextOrders)).toEqual([
      {
        tone: "error",
        message: "Payment needs review. Contact support.",
      },
    ]);
  });
});
