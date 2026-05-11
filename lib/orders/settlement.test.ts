import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Database } from "@/supabase/types/database";

const orderServiceMocks = vi.hoisted(() => ({
  getOrderById: vi.fn(),
  attachFirstSettlementPaymentIntent: vi.fn(),
  attachSettlementRetryPaymentIntent: vi.fn(),
  markOrderFailedAfterSettlementExhausted: vi.fn(),
  paymentIntentCancel: vi.fn().mockResolvedValue({}),
  paymentIntentRetrieve: vi.fn(),
  safeSendOrderStatusEmailHook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./service")>();
  return {
    ...actual,
    getOrderById: orderServiceMocks.getOrderById,
    attachFirstSettlementPaymentIntent: orderServiceMocks.attachFirstSettlementPaymentIntent,
    attachSettlementRetryPaymentIntent:
      orderServiceMocks.attachSettlementRetryPaymentIntent,
    markOrderFailedAfterSettlementExhausted:
      orderServiceMocks.markOrderFailedAfterSettlementExhausted,
  };
});

vi.mock("./status-email-hooks", () => ({
  safeSendOrderStatusEmailHook: orderServiceMocks.safeSendOrderStatusEmailHook,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: vi.fn(() => ({
    paymentIntents: {
      cancel: orderServiceMocks.paymentIntentCancel,
      retrieve: orderServiceMocks.paymentIntentRetrieve,
    },
  })),
  createSettlementPaymentIntentForOrder: vi.fn(),
}));

vi.mock("@/lib/activity-bookings/service", () => ({
  listActivityBookings: vi.fn(),
}));

import { createSettlementPaymentIntentForOrder } from "@/lib/stripe/server";
import { listActivityBookings } from "@/lib/activity-bookings/service";

import { tryBeginSettlementChargeForOrder } from "./settlement";

describe("tryBeginSettlementChargeForOrder", () => {
  const orderId = "order-1";
  const supabase = {} as import("@supabase/supabase-js").SupabaseClient<Database>;

  beforeEach(() => {
    vi.mocked(createSettlementPaymentIntentForOrder).mockReset();
    vi.mocked(createSettlementPaymentIntentForOrder).mockResolvedValue({
      id: "pi_settlement_1",
    } as Awaited<ReturnType<typeof createSettlementPaymentIntentForOrder>>);
    vi.mocked(listActivityBookings).mockReset();
    orderServiceMocks.getOrderById.mockReset();
    orderServiceMocks.attachFirstSettlementPaymentIntent.mockReset();
    orderServiceMocks.attachSettlementRetryPaymentIntent.mockReset();
    orderServiceMocks.markOrderFailedAfterSettlementExhausted.mockReset();
    orderServiceMocks.paymentIntentCancel.mockReset();
    orderServiceMocks.paymentIntentCancel.mockResolvedValue({});
    orderServiceMocks.paymentIntentRetrieve.mockReset();
    orderServiceMocks.paymentIntentRetrieve.mockResolvedValue({
      id: "pi_settlement_1",
      status: "requires_payment_method",
    });
    orderServiceMocks.safeSendOrderStatusEmailHook.mockReset();
    orderServiceMocks.safeSendOrderStatusEmailHook.mockResolvedValue(undefined);
  });

  it("returns early when order is not awaiting_vendor_approval", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
      id: orderId,
      status: "paid",
    } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(createSettlementPaymentIntentForOrder).not.toHaveBeenCalled();
  });

  it("returns early when a settlement PaymentIntent is already stored", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
      stripe_payment_intent_id: "pi_existing",
    } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(createSettlementPaymentIntentForOrder).not.toHaveBeenCalled();
  });

  it("returns early when a booking is still pending_approval", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
      stripe_payment_intent_id: null,
      stripe_customer_id: "cus_1",
      stripe_setup_intent_id: "seti_1",
    } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "pending_approval", total_cents: 1000 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(createSettlementPaymentIntentForOrder).not.toHaveBeenCalled();
  });

  it("returns early when there are no confirmed line totals to charge", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
      stripe_payment_intent_id: null,
      stripe_customer_id: "cus_1",
      stripe_setup_intent_id: "seti_1",
    } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "declined", total_cents: 1000 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(createSettlementPaymentIntentForOrder).not.toHaveBeenCalled();
  });

  it("throws when Stripe customer or setup intent is missing", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
      stripe_payment_intent_id: null,
      stripe_customer_id: null,
      stripe_setup_intent_id: null,
    } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "confirmed", total_cents: 500 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);

    await expect(tryBeginSettlementChargeForOrder(supabase, orderId)).rejects.toThrow(
      "Order is missing Stripe customer or setup intent for settlement",
    );
  });

  it("creates a settlement PaymentIntent and attaches it when eligible", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
      stripe_payment_intent_id: null,
      stripe_customer_id: "cus_1",
      stripe_setup_intent_id: "seti_1",
      currency: "usd",
    } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "confirmed", total_cents: 2500 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);
    orderServiceMocks.attachFirstSettlementPaymentIntent.mockResolvedValue({
      id: orderId,
      stripe_payment_intent_id: "pi_settlement_1",
    } as Awaited<ReturnType<typeof orderServiceMocks.attachFirstSettlementPaymentIntent>>);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(createSettlementPaymentIntentForOrder).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: orderId }),
      amountCents: 2500,
      idempotencyKey: `m4c-settlement-${orderId}-seti_1-1`,
    });
    expect(orderServiceMocks.attachFirstSettlementPaymentIntent).toHaveBeenCalledWith(
      supabase,
      orderId,
      "pi_settlement_1",
    );
    expect(orderServiceMocks.paymentIntentCancel).not.toHaveBeenCalled();
  });

  it("stores an immediate first-attempt failure and schedules the built-in retry", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
      stripe_payment_intent_id: null,
      stripe_customer_id: "cus_1",
      stripe_setup_intent_id: "seti_1",
      currency: "usd",
    } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "confirmed", total_cents: 2500 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);
    vi.mocked(createSettlementPaymentIntentForOrder)
      .mockRejectedValueOnce({
        payment_intent: {
          id: "pi_failed_1",
          status: "requires_payment_method",
        },
      })
      .mockResolvedValueOnce({
        id: "pi_retry_2",
      } as Awaited<ReturnType<typeof createSettlementPaymentIntentForOrder>>);
    orderServiceMocks.attachFirstSettlementPaymentIntent.mockResolvedValue({
      id: orderId,
      stripe_payment_intent_id: "pi_failed_1",
    } as Awaited<ReturnType<typeof orderServiceMocks.attachFirstSettlementPaymentIntent>>);
    orderServiceMocks.attachSettlementRetryPaymentIntent.mockResolvedValue({
      id: orderId,
      stripe_payment_intent_id: "pi_retry_2",
    } as Awaited<ReturnType<typeof orderServiceMocks.attachSettlementRetryPaymentIntent>>);

    await expect(tryBeginSettlementChargeForOrder(supabase, orderId)).resolves.toBeUndefined();

    expect(orderServiceMocks.attachFirstSettlementPaymentIntent).toHaveBeenCalledWith(
      supabase,
      orderId,
      "pi_failed_1",
    );
    expect(orderServiceMocks.attachSettlementRetryPaymentIntent).toHaveBeenCalledWith(
      supabase,
      {
        orderId,
        priorStripePaymentIntentId: "pi_failed_1",
        newStripePaymentIntentId: "pi_retry_2",
      },
    );
    expect(createSettlementPaymentIntentForOrder).toHaveBeenNthCalledWith(2, {
      order: expect.objectContaining({ id: orderId }),
      amountCents: 2500,
      idempotencyKey: `m4c-settlement-${orderId}-seti_1-2`,
    });
    expect(orderServiceMocks.markOrderFailedAfterSettlementExhausted).not.toHaveBeenCalled();
  });

  it("marks the order failed when the built-in retry also fails immediately", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
      id: orderId,
      status: "awaiting_vendor_approval",
      stripe_payment_intent_id: null,
      stripe_customer_id: "cus_1",
      stripe_setup_intent_id: "seti_1",
      currency: "usd",
    } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "confirmed", total_cents: 2500 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);
    vi.mocked(createSettlementPaymentIntentForOrder)
      .mockRejectedValueOnce({
        payment_intent: {
          id: "pi_failed_1",
          status: "requires_payment_method",
        },
      })
      .mockRejectedValueOnce({
        payment_intent: {
          id: "pi_failed_2",
          status: "requires_payment_method",
        },
      });
    orderServiceMocks.attachFirstSettlementPaymentIntent.mockResolvedValue({
      id: orderId,
      stripe_payment_intent_id: "pi_failed_1",
    } as Awaited<ReturnType<typeof orderServiceMocks.attachFirstSettlementPaymentIntent>>);
    orderServiceMocks.attachSettlementRetryPaymentIntent.mockResolvedValue({
      id: orderId,
      stripe_payment_intent_id: "pi_failed_2",
    } as Awaited<ReturnType<typeof orderServiceMocks.attachSettlementRetryPaymentIntent>>);
    orderServiceMocks.markOrderFailedAfterSettlementExhausted.mockResolvedValue({
      id: orderId,
      status: "failed",
    } as Awaited<ReturnType<typeof orderServiceMocks.markOrderFailedAfterSettlementExhausted>>);

    await expect(tryBeginSettlementChargeForOrder(supabase, orderId)).resolves.toBeUndefined();

    expect(orderServiceMocks.attachSettlementRetryPaymentIntent).toHaveBeenCalledWith(
      supabase,
      {
        orderId,
        priorStripePaymentIntentId: "pi_failed_1",
        newStripePaymentIntentId: "pi_failed_2",
      },
    );
    expect(
      orderServiceMocks.markOrderFailedAfterSettlementExhausted,
    ).toHaveBeenCalledWith(supabase, orderId, "pi_failed_2");
    expect(orderServiceMocks.safeSendOrderStatusEmailHook).toHaveBeenCalledWith(
      supabase,
      {
        orderId,
        event: "payment_failed",
      },
    );
  });

  it("does not cancel when webhook already marked order paid with the same PaymentIntent", async () => {
    orderServiceMocks.getOrderById
      .mockResolvedValueOnce({
        id: orderId,
        status: "awaiting_vendor_approval",
        stripe_payment_intent_id: null,
        stripe_customer_id: "cus_1",
        stripe_setup_intent_id: "seti_1",
        currency: "usd",
      } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>)
      .mockResolvedValueOnce({
        id: orderId,
        status: "paid",
        stripe_payment_intent_id: "pi_settlement_1",
        stripe_customer_id: "cus_1",
        stripe_setup_intent_id: "seti_1",
        currency: "usd",
      } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "confirmed", total_cents: 100 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);
    orderServiceMocks.attachFirstSettlementPaymentIntent.mockResolvedValue(null);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(orderServiceMocks.paymentIntentRetrieve).not.toHaveBeenCalled();
    expect(orderServiceMocks.paymentIntentCancel).not.toHaveBeenCalled();
  });

  it("does not cancel when concurrent attach stored the same PaymentIntent as payment_pending", async () => {
    orderServiceMocks.getOrderById
      .mockResolvedValueOnce({
        id: orderId,
        status: "awaiting_vendor_approval",
        stripe_payment_intent_id: null,
        stripe_customer_id: "cus_1",
        stripe_setup_intent_id: "seti_1",
        currency: "usd",
      } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>)
      .mockResolvedValueOnce({
        id: orderId,
        status: "payment_pending",
        stripe_payment_intent_id: "pi_settlement_1",
        stripe_customer_id: "cus_1",
        stripe_setup_intent_id: "seti_1",
        currency: "usd",
      } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "confirmed", total_cents: 100 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);
    orderServiceMocks.attachFirstSettlementPaymentIntent.mockResolvedValue(null);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(orderServiceMocks.paymentIntentRetrieve).not.toHaveBeenCalled();
    expect(orderServiceMocks.paymentIntentCancel).not.toHaveBeenCalled();
  });

  it("cancels orphaned cancelable PaymentIntent when attach loses race and order is unchanged", async () => {
    orderServiceMocks.getOrderById
      .mockResolvedValueOnce({
        id: orderId,
        status: "awaiting_vendor_approval",
        stripe_payment_intent_id: null,
        stripe_customer_id: "cus_1",
        stripe_setup_intent_id: "seti_1",
        currency: "usd",
      } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>)
      .mockResolvedValueOnce({
        id: orderId,
        status: "awaiting_vendor_approval",
        stripe_payment_intent_id: null,
        stripe_customer_id: "cus_1",
        stripe_setup_intent_id: "seti_1",
        currency: "usd",
      } as Awaited<ReturnType<typeof orderServiceMocks.getOrderById>>);
    vi.mocked(listActivityBookings).mockResolvedValue([
      { status: "confirmed", total_cents: 100 },
    ] as Awaited<ReturnType<typeof listActivityBookings>>);
    orderServiceMocks.paymentIntentRetrieve.mockResolvedValue({
      id: "pi_settlement_1",
      status: "requires_payment_method",
    });
    orderServiceMocks.attachFirstSettlementPaymentIntent.mockResolvedValue(null);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(orderServiceMocks.paymentIntentRetrieve).toHaveBeenCalledWith("pi_settlement_1");
    expect(orderServiceMocks.paymentIntentCancel).toHaveBeenCalledWith("pi_settlement_1");
  });
});
