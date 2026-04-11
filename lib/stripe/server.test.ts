import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";

import { CART_LINE_TYPE_ACTIVITY } from "@/lib/cart/constants";
import type { Order } from "@/lib/orders/types";

import {
  createCheckoutSessionForOrder,
  fulfillCheckoutSessionCompleted,
} from "./server";

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    user_id: "user-1",
    status: "awaiting_payment",
    currency: "usd",
    subtotal_cents: 10000,
    discount_cents: 0,
    total_cents: 10000,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("createCheckoutSessionForOrder", () => {
  it("throws when activity line totals do not match order.total_cents", async () => {
    await expect(
      createCheckoutSessionForOrder({
        order: baseOrder({ total_cents: 9999 }),
        lines: [
          {
            id: "line-1",
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
          },
        ],
        siteUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("Cart line totals do not match order total");
  });

  it("throws when there are no activity lines", async () => {
    await expect(
      createCheckoutSessionForOrder({
        order: baseOrder(),
        lines: [],
        siteUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("Checkout requires at least one activity line");
  });
});

describe("fulfillCheckoutSessionCompleted", () => {
  it("returns ignored for non-checkout.session.completed events", async () => {
    const event = {
      id: "evt_1",
      type: "customer.created",
    } as unknown as Stripe.Event;

    const result = await fulfillCheckoutSessionCompleted(
      event,
      {} as never,
    );

    expect(result).toEqual({ status: "ignored", reason: "event_type" });
  });

  it("returns duplicate_event when stripe_event_id is already recorded", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_event_id: "evt_1" },
      error: null,
    });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      })),
    };

    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: {} },
    } as unknown as Stripe.Event;

    const result = await fulfillCheckoutSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "duplicate_event" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
  });
});
