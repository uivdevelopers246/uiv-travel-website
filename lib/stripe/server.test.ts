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
    setupIntents = {
      retrieve: vi.fn().mockResolvedValue({
        id: "seti_test",
        payment_method: "pm_test",
      }),
    };
    paymentIntents = {
      create: vi.fn().mockResolvedValue({
        id: "pi_test",
        amount: 1000,
        currency: "usd",
      }),
      cancel: vi.fn().mockResolvedValue({ id: "pi_test", status: "canceled" }),
    };
    webhooks = {
      constructEvent: vi.fn(),
    };
  },
}));

import {
  createCheckoutSetupSessionForOrder,
  createSettlementPaymentIntentForOrder,
  fulfillCheckoutSetupSessionCompleted,
  fulfillSetupIntentSucceeded,
  fulfillSettlementPaymentIntentPaymentFailed,
  fulfillSettlementPaymentIntentSucceeded,
  getStripe,
} from "./server";
import {
  STRIPE_METADATA_FLOW_M4C_SETUP,
  STRIPE_METADATA_FLOW_M4C_SETTLEMENT,
} from "@/lib/orders/constants";

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
    settlement_charge_attempt_count: 0,
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

  it("passes metadata.order_id on the session and on setup_intent_data for webhook correlation", async () => {
    const line = {
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
    };

    await createCheckoutSetupSessionForOrder({
      order: baseOrder({ id: "order-xyz" }),
      lines: [line],
      siteUrl: "http://localhost:3000",
      stripeCustomerId: "cus_test",
    });

    const stripe = getStripe();
    const createMock = stripe.checkout.sessions.create as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "setup",
        success_url: "http://localhost:3000/checkout/success",
        cancel_url: "http://localhost:3000/checkout/cancel",
        metadata: { order_id: "order-xyz", flow: "m4c_setup" },
        setup_intent_data: {
          metadata: { order_id: "order-xyz", flow: "m4c_setup" },
        },
        client_reference_id: "order-xyz",
      }),
    );
  });
});

function checkoutSessionCompletedEvent(
  sessionOverrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Event {
  const metadata = {
    order_id: "order-1",
    flow: STRIPE_METADATA_FLOW_M4C_SETUP,
    ...(sessionOverrides.metadata ?? {}),
  };
  const session = {
    id: "cs_1",
    mode: "setup" as const,
    metadata,
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

  it("treats duplicate stripe_webhook_events inserts as idempotent success", async () => {
    const supabase = supabaseWithFromQueue([
      () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      () => ({
        insert: vi.fn().mockResolvedValue({
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        }),
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

  it("returns ignored missing_order_id when setup session metadata lacks order_id", async () => {
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

    const result = await fulfillCheckoutSetupSessionCompleted(
      checkoutSessionCompletedEvent({ metadata: {} }),
      supabase as never,
    );

    expect(result).toEqual({ status: "ignored", reason: "missing_order_id" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
  });

  it("returns order_not_found and records stripe_webhook_events when order lookup misses", async () => {
    const insertStripeWebhookEvent = vi.fn().mockResolvedValue({ error: null });
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
      () => ({
        insert: insertStripeWebhookEvent,
      }),
    ]);

    const result = await fulfillCheckoutSetupSessionCompleted(
      checkoutSessionCompletedEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "order_not_found" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
    expect(insertStripeWebhookEvent).toHaveBeenCalledWith({
      stripe_event_id: "evt_1",
    });
  });
});

function paymentIntentSucceededEvent(
  piOverrides: Partial<Stripe.PaymentIntent> = {},
): Stripe.Event {
  const pi = {
    id: "pi_settlement_1",
    amount: 3000,
    currency: "usd",
    metadata: {
      order_id: "order-1",
      flow: STRIPE_METADATA_FLOW_M4C_SETTLEMENT,
    },
    ...piOverrides,
  } as Stripe.PaymentIntent;

  return {
    id: "evt_pi_success",
    type: "payment_intent.succeeded",
    data: { object: pi },
  } as Stripe.Event;
}

function setupIntentSucceededEvent(
  siOverrides: Partial<Stripe.SetupIntent> = {},
): Stripe.Event {
  const metadata = {
    order_id: "order-1",
    flow: STRIPE_METADATA_FLOW_M4C_SETUP,
    ...(siOverrides.metadata ?? {}),
  };
  const si = {
    id: "seti_1",
    metadata,
    customer: "cus_1",
    ...siOverrides,
  } as Stripe.SetupIntent;

  return {
    id: "evt_seti_success",
    type: "setup_intent.succeeded",
    data: { object: si },
  } as Stripe.Event;
}

function paymentIntentFailedEvent(
  piOverrides: Partial<Stripe.PaymentIntent> = {},
): Stripe.Event {
  const pi = {
    id: "pi_settlement_failed_1",
    amount: 3000,
    currency: "usd",
    metadata: {
      order_id: "order-1",
      flow: STRIPE_METADATA_FLOW_M4C_SETTLEMENT,
    },
    ...piOverrides,
  } as Stripe.PaymentIntent;

  return {
    id: "evt_pi_failed",
    type: "payment_intent.payment_failed",
    data: { object: pi },
  } as Stripe.Event;
}

function supabaseForSuccessfulSettlement() {
  let step = 0;
  return {
    from: vi.fn(() => {
      step += 1;
      if (step === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (step === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "order-1",
              status: "payment_pending",
              currency: "usd",
              stripe_payment_intent_id: "pi_settlement_1",
            },
            error: null,
          }),
        };
      }
      if (step === 3) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({
            data: [{ status: "confirmed", total_cents: 3000 }],
            error: null,
          }),
        };
      }
      if (step === 4) {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "order-1", status: "paid" },
            error: null,
          }),
        };
      }
      if (step === 5) {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      throw new Error(`Unexpected from() step ${step}`);
    }),
  };
}

function supabaseForSuccessfulSettlementBeforeAttach() {
  let step = 0;
  return {
    from: vi.fn(() => {
      step += 1;
      if (step === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (step === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "order-1",
              status: "awaiting_vendor_approval",
              currency: "usd",
              stripe_payment_intent_id: null,
            },
            error: null,
          }),
        };
      }
      if (step === 3) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({
            data: [{ status: "confirmed", total_cents: 3000 }],
            error: null,
          }),
        };
      }
      if (step === 4) {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "order-1", status: "paid" },
            error: null,
          }),
        };
      }
      if (step === 5) {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      throw new Error(`Unexpected from() step ${step}`);
    }),
  };
}

describe("createSettlementPaymentIntentForOrder", () => {
  it("throws when amount is below one cent", async () => {
    await expect(
      createSettlementPaymentIntentForOrder({
        order: baseOrder({
          stripe_customer_id: "cus_1",
          stripe_setup_intent_id: "seti_1",
        }),
        amountCents: 0,
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow("Settlement amount must be at least 1 cent");
  });

  it("retrieves the SetupIntent and creates an off-session confirmed PaymentIntent with M4-C metadata", async () => {
    const stripe = getStripe();
    await createSettlementPaymentIntentForOrder({
      order: baseOrder({
        id: "order-abc",
        stripe_customer_id: "cus_1",
        stripe_setup_intent_id: "seti_1",
        currency: "usd",
      }),
      amountCents: 4200,
      idempotencyKey: "idem-m4c-1",
    });

    expect(stripe.setupIntents.retrieve).toHaveBeenCalledWith("seti_1");
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4200,
        currency: "usd",
        customer: "cus_1",
        payment_method: "pm_test",
        off_session: true,
        confirm: true,
        metadata: {
          order_id: "order-abc",
          flow: STRIPE_METADATA_FLOW_M4C_SETTLEMENT,
        },
      }),
      { idempotencyKey: "idem-m4c-1" },
    );
  });
});

describe("fulfillSetupIntentSucceeded", () => {
  it("returns order_not_found and records stripe_webhook_events when order lookup misses", async () => {
    const insertStripeWebhookEvent = vi.fn().mockResolvedValue({ error: null });
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
      () => ({
        insert: insertStripeWebhookEvent,
      }),
    ]);

    const result = await fulfillSetupIntentSucceeded(
      setupIntentSucceededEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "order_not_found" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
    expect(insertStripeWebhookEvent).toHaveBeenCalledWith({
      stripe_event_id: "evt_seti_success",
    });
  });
});

describe("fulfillSettlementPaymentIntentSucceeded", () => {
  it("returns duplicate_event when the Stripe event id was already processed", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_event_id: "evt_pi_success" },
      error: null,
    });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      })),
    };

    const result = await fulfillSettlementPaymentIntentSucceeded(
      paymentIntentSucceededEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "duplicate_event" });
  });

  it("returns ignored not_settlement_flow when metadata.flow is not m4c_settlement", async () => {
    let stripeEventsFrom = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "stripe_webhook_events") {
          stripeEventsFrom += 1;
          if (stripeEventsFrom === 1) {
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
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const result = await fulfillSettlementPaymentIntentSucceeded(
      paymentIntentSucceededEvent({ metadata: { order_id: "order-1", flow: "other" } }),
      supabase as never,
    );

    expect(result).toEqual({ status: "ignored", reason: "not_settlement_flow" });
  });

  it("returns ignored missing_order_id when payment_intent metadata lacks order_id", async () => {
    let stripeEventsFrom = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "stripe_webhook_events") {
          stripeEventsFrom += 1;
          if (stripeEventsFrom === 1) {
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
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const result = await fulfillSettlementPaymentIntentSucceeded(
      paymentIntentSucceededEvent({ metadata: { flow: STRIPE_METADATA_FLOW_M4C_SETTLEMENT } }),
      supabase as never,
    );

    expect(result).toEqual({ status: "ignored", reason: "missing_order_id" });
  });

  it("returns reconciliation_required when the PaymentIntent amount does not match confirmed booking totals", async () => {
    let step = 0;
    const supabase = {
      from: vi.fn(() => {
        step += 1;
        if (step === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (step === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "order-1",
                status: "payment_pending",
                currency: "usd",
              },
              error: null,
            }),
          };
        }
        if (step === 3) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({
              data: [{ status: "confirmed", total_cents: 1000 }],
              error: null,
            }),
          };
        }
        if (step === 4) {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "order-1", status: "reconciliation_required" },
              error: null,
            }),
          };
        }
        if (step === 5) {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        throw new Error(`Unexpected step ${step}`);
      }),
    };

    const result = await fulfillSettlementPaymentIntentSucceeded(
      paymentIntentSucceededEvent({ amount: 9999 }),
      supabase as never,
    );

    expect(result).toEqual({ status: "reconciliation_required" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
    expect(supabase.from).toHaveBeenCalledWith("orders");
    expect(supabase.from).toHaveBeenCalledWith("activity_bookings");
  });

  it("returns reconciliation_required when mismatch transition is already applied by a prior delivery", async () => {
    let step = 0;
    const supabase = {
      from: vi.fn(() => {
        step += 1;
        if (step === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (step === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "order-1",
                status: "payment_pending",
                currency: "usd",
              },
              error: null,
            }),
          };
        }
        if (step === 3) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({
              data: [{ status: "confirmed", total_cents: 1000 }],
              error: null,
            }),
          };
        }
        if (step === 4) {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        if (step === 5) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "order-1",
                status: "reconciliation_required",
                currency: "usd",
              },
              error: null,
            }),
          };
        }
        if (step === 6) {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        throw new Error(`Unexpected step ${step}`);
      }),
    };

    const result = await fulfillSettlementPaymentIntentSucceeded(
      paymentIntentSucceededEvent({ amount: 9999 }),
      supabase as never,
    );

    expect(result).toEqual({ status: "reconciliation_required" });
    expect(supabase.from).toHaveBeenCalledWith("orders");
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
  });

  it("marks the order paid and records the webhook on success", async () => {
    const supabase = supabaseForSuccessfulSettlement();

    const result = await fulfillSettlementPaymentIntentSucceeded(
      paymentIntentSucceededEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "success" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
    expect(supabase.from).toHaveBeenCalledWith("orders");
    expect(supabase.from).toHaveBeenCalledWith("activity_bookings");
  });

  it("marks settlement success when webhook arrives before attach updates the order", async () => {
    const supabase = supabaseForSuccessfulSettlementBeforeAttach();

    const result = await fulfillSettlementPaymentIntentSucceeded(
      paymentIntentSucceededEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "success" });
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
    expect(supabase.from).toHaveBeenCalledWith("orders");
    expect(supabase.from).toHaveBeenCalledWith("activity_bookings");
  });
});

describe("fulfillSettlementPaymentIntentPaymentFailed", () => {
  it("marks a recovery attempt as terminally failed when attempt count is 3", async () => {
    let step = 0;
    const supabase = {
      from: vi.fn(() => {
        step += 1;
        if (step === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (step === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "order-1",
                status: "payment_pending",
                currency: "usd",
                stripe_payment_intent_id: "pi_settlement_failed_1",
                settlement_charge_attempt_count: 3,
              },
              error: null,
            }),
          };
        }
        if (step === 3) {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "order-1", status: "failed" },
              error: null,
            }),
          };
        }
        if (step === 4) {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        throw new Error(`Unexpected step ${step}`);
      }),
    };

    const result = await fulfillSettlementPaymentIntentPaymentFailed(
      paymentIntentFailedEvent(),
      supabase as never,
    );

    expect(result).toEqual({ status: "terminal_failed" });
    expect(supabase.from).toHaveBeenCalledWith("orders");
    expect(supabase.from).toHaveBeenCalledWith("stripe_webhook_events");
  });
});
