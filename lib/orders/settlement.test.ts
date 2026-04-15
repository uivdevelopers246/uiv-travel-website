import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Database } from "@/supabase/types/database";

const orderServiceMocks = vi.hoisted(() => ({
  getOrderById: vi.fn(),
  attachFirstSettlementPaymentIntent: vi.fn(),
  paymentIntentCancel: vi.fn().mockResolvedValue({}),
}));

vi.mock("./service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./service")>();
  return {
    ...actual,
    getOrderById: orderServiceMocks.getOrderById,
    attachFirstSettlementPaymentIntent: orderServiceMocks.attachFirstSettlementPaymentIntent,
  };
});

vi.mock("@/lib/stripe/server", () => ({
  getStripe: vi.fn(() => ({
    paymentIntents: {
      cancel: orderServiceMocks.paymentIntentCancel,
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
    orderServiceMocks.paymentIntentCancel.mockReset();
    orderServiceMocks.paymentIntentCancel.mockResolvedValue({});
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
      idempotencyKey: `m4c-settlement-${orderId}-1`,
    });
    expect(orderServiceMocks.attachFirstSettlementPaymentIntent).toHaveBeenCalledWith(
      supabase,
      orderId,
      "pi_settlement_1",
    );
    expect(orderServiceMocks.paymentIntentCancel).not.toHaveBeenCalled();
  });

  it("cancels the PaymentIntent when attachFirstSettlementPaymentIntent loses the race", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue({
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
    orderServiceMocks.attachFirstSettlementPaymentIntent.mockResolvedValue(null);

    await tryBeginSettlementChargeForOrder(supabase, orderId);

    expect(orderServiceMocks.paymentIntentCancel).toHaveBeenCalledWith("pi_settlement_1");
  });
});
