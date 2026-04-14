import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

import { CART_LINE_TYPE_ACTIVITY } from "@/lib/cart/constants";
import type { Order } from "@/lib/orders/types";

vi.mock("stripe", () => ({
  default: class MockStripe {
    customers = {
      create: vi.fn().mockResolvedValue({ id: "cus_test" }),
    };
    checkout = {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "cs_test",
          url: "https://checkout.stripe.com/test",
        }),
      },
    };
    webhooks = {
      constructEvent: vi.fn(),
    };
  },
}));

import {
  createCheckoutSetupSessionForOrder,
  fulfillCheckoutSetupSessionCompleted,
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
    stripe_customer_id: null,
    stripe_setup_intent_id: null,
    stripe_approval_payment_intent_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Sequential `from()` builders: each call to `from()` consumes the next builder. */
function supabaseWithFromQueue(
  builders: Array<() => Record<string, unknown>>,
  rpcImpl?: ReturnType<typeof vi.fn>,
) {
  let index = 0;
  return {
    from: vi.fn(() => {
      const next = builders[index];
      index += 1;
      if (!next) {
        throw new Error(`Unexpected from() call (index ${index - 1})`);
      }
      return next();
    }),
    rpc:
      rpcImpl ??
      vi.fn().mockResolvedValue({
        data: {
          id: "booking-1",
          order_id: "order-1",
          slot_id: "slot-1",
          activity_id: "act-1",
          user_id: "user-1",
          vendor_id: "vendor-1",
          status: "pending_approval",
        },
        error: null,
      }),
  };
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
});

describe("createCheckoutSetupSessionForOrder", () => {
  it("throws when activity line totals do not match order.total_cents", async () => {
    await expect(
      createCheckoutSetupSessionForOrder({
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
        stripeCustomerId: "cus_test",
      }),
    ).rejects.toThrow("Cart line totals do not match order total");
  });

  it("throws when there are no activity lines", async () => {
    await expect(
      createCheckoutSetupSessionForOrder({
        order: baseOrder(),
        lines: [],
        siteUrl: "http://localhost:3000",
        stripeCustomerId: "cus_test",
      }),
    ).rejects.toThrow("Checkout requires at least one activity line");
  });
});

function checkoutSessionCompletedEvent(
  sessionOverrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Event {
  const session = {
    id: "cs_1",
    mode: "setup" as const,
    metadata: { order_id: "order-1" },
    setup_intent: "seti_1",
    customer: "cus_1",
    ...sessionOverrides,
  } as Stripe.Checkout.Session;

  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: session },
  } as Stripe.Event;
}

describe("fulfillCheckoutSetupSessionCompleted", () => {
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

    const event = checkoutSessionCompletedEvent();

    const result = await fulfillCheckoutSetupSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "duplicate_event" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
  });

  it("returns ignored mode_not_setup for non-setup Checkout sessions and records the event", async () => {
    const supabase = supabaseWithFromQueue([
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      () => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    ]);

    const event = checkoutSessionCompletedEvent({
      mode: "payment" as unknown as Stripe.Checkout.Session["mode"],
      payment_status: "paid",
      payment_intent: "pi_1",
    });

    const result = await fulfillCheckoutSetupSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "ignored", reason: "mode_not_setup" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
  });
});
