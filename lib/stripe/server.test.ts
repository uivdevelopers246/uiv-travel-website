import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

import { CART_LINE_TYPE_ACTIVITY } from "@/lib/cart/constants";
import type { Order } from "@/lib/orders/types";

const { refundsCreate } = vi.hoisted(() => ({
  refundsCreate: vi.fn().mockResolvedValue({ id: "re_1" }),
}));

vi.mock("stripe", () => ({
  default: class MockStripe {
    refunds = { create: refundsCreate };
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

function activityCartLine(
  overrides: Partial<{
    slot_id: string;
    participants: number;
    line_total_cents: number;
  }> = {},
) {
  return {
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
    ...overrides,
  };
}

function checkoutCompletedEvent(
  sessionOverrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Event {
  const session = {
    id: "cs_1",
    mode: "payment" as const,
    payment_status: "paid" as const,
    amount_total: 10000,
    currency: "usd",
    metadata: { order_id: "order-1" },
    payment_intent: "pi_1",
    ...sessionOverrides,
  } as Stripe.Checkout.Session;

  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: session },
  } as Stripe.Event;
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
          status: "confirmed",
        },
        error: null,
      }),
  };
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  refundsCreate.mockClear();
});

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

  it("returns ignored when payment_status is not paid", async () => {
    const supabase = supabaseWithFromQueue([
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    ]);

    const event = checkoutCompletedEvent({ payment_status: "unpaid" });

    const result = await fulfillCheckoutSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "ignored", reason: "payment_status" });
  });

  it("returns ignored when mode is not payment", async () => {
    const supabase = supabaseWithFromQueue([
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    ]);

    const event = checkoutCompletedEvent({
      mode: "subscription" as unknown as Stripe.Checkout.Session["mode"],
    });

    const result = await fulfillCheckoutSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "ignored", reason: "mode" });
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

  it("returns order_not_found when the order row is missing", async () => {
    const supabase = supabaseWithFromQueue([
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    ]);

    const event = checkoutCompletedEvent();

    const result = await fulfillCheckoutSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "order_not_found" });
  });

  it("returns amount_mismatch_marked_failed and refunds when totals do not match", async () => {
    const paidOrder = baseOrder({
      stripe_checkout_session_id: "cs_1",
    });

    const supabase = supabaseWithFromQueue([
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: paidOrder, error: null }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [activityCartLine()],
          error: null,
        }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      () => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { ...paidOrder, status: "failed" },
          error: null,
        }),
      }),
      () => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    ]);

    const event = checkoutCompletedEvent({ amount_total: 9999 });

    const result = await fulfillCheckoutSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "amount_mismatch_marked_failed" });
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" });
  });

  it("returns success for awaiting_payment: marks paid, creates booking, clears cart, records event", async () => {
    const orderRow = baseOrder();
    const paidOrder = { ...orderRow, status: "paid" as const, stripe_payment_intent_id: "pi_1" };

    const supabase = supabaseWithFromQueue([
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [activityCartLine()],
          error: null,
        }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      () => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: paidOrder, error: null }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: "slot-1",
              activity_id: "act-1",
              vendor_id: "vendor-1",
              starts_at: "2026-04-06T12:00:00.000Z",
              ends_at: "2026-04-06T14:00:00.000Z",
              max_capacity: 10,
              is_cancelled: false,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        }),
      }),
      () => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      () => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    ]);

    const event = checkoutCompletedEvent();

    const result = await fulfillCheckoutSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "success" });
    expect(supabase.from).toHaveBeenCalledWith("cart_lines");
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
  });

  it("returns already_fulfilled when order is paid and bookings cover cart lines", async () => {
    const paidOrder = baseOrder({
      status: "paid",
      stripe_payment_intent_id: "pi_1",
      stripe_checkout_session_id: "cs_1",
    });

    const supabase = supabaseWithFromQueue([
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: paidOrder, error: null }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [activityCartLine()],
          error: null,
        }),
      }),
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [
            {
              id: "booking-1",
              order_id: "order-1",
              slot_id: "slot-1",
              activity_id: "act-1",
              user_id: "user-1",
              vendor_id: "vendor-1",
              status: "confirmed",
              participants: 2,
              unit_price_cents: 5000,
              subtotal_cents: 10000,
              discount_cents: 0,
              total_cents: 10000,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        }),
      }),
      () => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      () => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    ]);

    const event = checkoutCompletedEvent();

    const result = await fulfillCheckoutSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "already_fulfilled" });
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("returns partial_failure_marked_refunded when a later booking RPC fails", async () => {
    const orderRow = baseOrder({
      total_cents: 15000,
      subtotal_cents: 15000,
    });
    const paidOrder = { ...orderRow, status: "paid" as const, stripe_payment_intent_id: "pi_1" };
    const lineA = activityCartLine({ id: "line-a", slot_id: "slot-a" });
    const lineB = activityCartLine({
      id: "line-b",
      slot_id: "slot-b",
      line_total_cents: 5000,
      line_subtotal_cents: 5000,
      participants: 1,
    });

    let createCalls = 0;
    const rpc = vi.fn().mockImplementation((name: string) => {
      if (name === "create_activity_booking_after_payment") {
        createCalls += 1;
        if (createCalls === 1) {
          return Promise.resolve({
            data: {
              id: "booking-a",
              order_id: "order-1",
              slot_id: "slot-a",
              activity_id: "act-1",
              user_id: "user-1",
              vendor_id: "vendor-1",
              status: "confirmed",
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: null,
          error: { message: "capacity exceeded" },
        });
      }
      if (name === "cancel_activity_bookings_for_order") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const supabase = supabaseWithFromQueue(
      [
        () => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        () => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
        }),
        () => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [lineA, lineB],
            error: null,
          }),
        }),
        () => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        () => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: paidOrder, error: null }),
        }),
        () => ({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [
              {
                id: "slot-a",
                activity_id: "act-1",
                vendor_id: "vendor-1",
                starts_at: "2026-04-06T12:00:00.000Z",
                ends_at: "2026-04-06T14:00:00.000Z",
                max_capacity: 10,
                is_cancelled: false,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              },
              {
                id: "slot-b",
                activity_id: "act-1",
                vendor_id: "vendor-1",
                starts_at: "2026-04-06T15:00:00.000Z",
                ends_at: "2026-04-06T17:00:00.000Z",
                max_capacity: 10,
                is_cancelled: false,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              },
            ],
            error: null,
          }),
        }),
        () => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { ...paidOrder, status: "refunded" },
            error: null,
          }),
        }),
        () => ({
          insert: vi.fn().mockResolvedValue({ error: null }),
        }),
      ],
      rpc,
    );

    const event = checkoutCompletedEvent({
      amount_total: 15000,
    });

    const result = await fulfillCheckoutSessionCompleted(event, supabase as never);

    expect(result).toEqual({ status: "partial_failure_marked_refunded" });
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" });
    expect(rpc).toHaveBeenCalledWith(
      "cancel_activity_bookings_for_order",
      expect.objectContaining({ p_order_id: "order-1" }),
    );
  });
});
