import { describe, expect, it } from "vitest";

import type { ActivityBookingWithPreview, OrderWithActivityBookingsPaymentPreview } from "@/lib/orders/types";

import {
  getOrderCardState,
  shouldOrderPoll,
  shouldOrdersPoll,
} from "./my-bookings-ui";

function makeBooking(
  overrides: Partial<ActivityBookingWithPreview> = {},
): ActivityBookingWithPreview {
  return {
    id: "booking-1",
    activity_id: "activity-1",
    activity_title: "Island Sail",
    activity_image_url: "https://example.com/island-sail.jpg",
    approval_deadline_at: "2026-01-02T12:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    discount_cents: 0,
    expires_at: "2026-01-02T12:00:00.000Z",
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
    ...overrides,
  };
}

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
    activity_bookings: [makeBooking()],
    ...overrides,
  };
}

describe("getOrderCardState", () => {
  it("summarizes pending approval orders with the earliest countdown and polling enabled", () => {
    const state = getOrderCardState(
      makeOrder({
        activity_bookings: [
          makeBooking({
            id: "booking-1",
            approval_deadline_at: "2026-01-02T09:00:00.000Z",
          }),
          makeBooking({
            id: "booking-2",
            approval_deadline_at: "2026-01-02T12:00:00.000Z",
          }),
        ],
      }),
      new Date("2026-01-02T08:00:00.000Z").getTime(),
    );

    expect(state.phase).toMatchObject({
      label: "Waiting for vendor review",
      tone: "amber",
    });
    expect(state.pendingApprovalSummary).toBe("2 bookings are still under review");
    expect(state.countdown).toMatchObject({
      kind: "active",
      deadlineAt: "2026-01-02T09:00:00.000Z",
    });
    expect(state.shouldPoll).toBe(true);
    expect(state.hasActiveCountdown).toBe(true);
  });

  it("shows a stale countdown message when a pending booking is past its deadline", () => {
    const state = getOrderCardState(
      makeOrder(),
      new Date("2026-01-02T12:30:00.000Z").getTime(),
    );

    expect(state.countdown).toMatchObject({
      kind: "expired",
      message: "Vendor response window closed. Waiting for final update.",
    });
    expect(state.bookingStates[0]).toMatchObject({
      statusLabel: "Pending approval",
      detail: "Vendor response window closed. Waiting for final update.",
    });
  });

  it("explains mixed booking outcomes while payment is processing", () => {
    const state = getOrderCardState(
      makeOrder({
        status: "payment_pending",
        stripe_payment_intent_id: "pi_123",
        payment_summary: {
          status: "processing",
          receipt_url: null,
          failure_message: null,
          can_retry_with_payment_method_update: false,
          show_contact_support: false,
        },
        activity_bookings: [
          makeBooking({
            id: "booking-confirmed",
            status: "confirmed",
            approval_deadline_at: null,
          }),
          makeBooking({
            id: "booking-declined",
            status: "declined",
            approval_deadline_at: null,
          }),
        ],
      }),
      new Date("2026-01-02T08:00:00.000Z").getTime(),
    );

    expect(state.phase.label).toBe("Charging saved payment method");
    expect(state.bookingStates[0]?.detail).toContain("charge is now processing");
    expect(state.bookingStates[1]?.detail).toBe(
      "Vendor declined this booking. It will not be charged.",
    );
    expect(state.pendingApprovalCount).toBe(0);
  });

  it("keeps receipt visibility on paid orders", () => {
    const state = getOrderCardState(
      makeOrder({
        status: "paid",
        stripe_payment_intent_id: "pi_paid",
        payment_summary: {
          status: "paid",
          receipt_url: "https://example.com/receipt",
          failure_message: null,
          can_retry_with_payment_method_update: false,
          show_contact_support: false,
        },
        activity_bookings: [
          makeBooking({
            status: "confirmed",
            approval_deadline_at: null,
          }),
        ],
      }),
      new Date("2026-01-02T08:00:00.000Z").getTime(),
    );

    expect(state.phase.label).toBe("Payment complete");
    expect(state.notice.actions.receiptUrl).toBe("https://example.com/receipt");
    expect(state.notice.actions.canRetry).toBe(false);
  });

  it("separates retry-eligible failures from support-only failures", () => {
    const retryable = getOrderCardState(
      makeOrder({
        status: "failed",
        stripe_payment_intent_id: "pi_failed",
        payment_summary: {
          status: "failed",
          receipt_url: null,
          failure_message: "Your card was declined.",
          can_retry_with_payment_method_update: true,
          show_contact_support: false,
        },
        activity_bookings: [
          makeBooking({
            status: "confirmed",
            approval_deadline_at: null,
          }),
        ],
      }),
      new Date("2026-01-02T08:00:00.000Z").getTime(),
    );

    const supportOnly = getOrderCardState(
      makeOrder({
        status: "failed",
        stripe_payment_intent_id: "pi_failed_support",
        payment_summary: {
          status: "failed",
          receipt_url: null,
          failure_message: "Retry limit reached.",
          can_retry_with_payment_method_update: false,
          show_contact_support: true,
        },
        activity_bookings: [
          makeBooking({
            status: "confirmed",
            approval_deadline_at: null,
          }),
        ],
      }),
      new Date("2026-01-02T08:00:00.000Z").getTime(),
    );

    expect(retryable.notice.actions).toMatchObject({
      canRetry: true,
      showContactSupport: false,
    });
    expect(supportOnly.notice.actions).toMatchObject({
      canRetry: false,
      showContactSupport: true,
    });
  });

  it("surfaces reconciliation-required orders as support review", () => {
    const state = getOrderCardState(
      makeOrder({
        status: "reconciliation_required",
        payment_summary: null,
        activity_bookings: [
          makeBooking({
            status: "confirmed",
            approval_deadline_at: null,
          }),
        ],
      }),
      new Date("2026-01-02T08:00:00.000Z").getTime(),
    );

    expect(state.phase.label).toBe("Needs support review");
    expect(state.notice.actions.showContactSupport).toBe(true);
    expect(state.notice.paymentLabel).toContain("manual review");
  });
});

describe("polling decisions", () => {
  it("polls while an order is still live and stops once all orders are settled", () => {
    const liveOrder = makeOrder();
    const settledOrder = makeOrder({
      status: "paid",
      payment_summary: {
        status: "paid",
        receipt_url: null,
        failure_message: null,
        can_retry_with_payment_method_update: false,
        show_contact_support: false,
      },
      activity_bookings: [
        makeBooking({
          status: "confirmed",
          approval_deadline_at: null,
        }),
      ],
    });

    expect(shouldOrderPoll(liveOrder)).toBe(true);
    expect(shouldOrderPoll(settledOrder)).toBe(false);
    expect(shouldOrdersPoll([liveOrder, settledOrder])).toBe(true);
    expect(shouldOrdersPoll([settledOrder])).toBe(false);
  });
});
