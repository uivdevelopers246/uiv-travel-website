import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const stripeServerMocks = vi.hoisted(() => ({
  parseAndVerifyStripeWebhook: vi.fn(),
  fulfillCheckoutSetupSessionCompleted: vi.fn(),
  fulfillSetupIntentSucceeded: vi.fn(),
  fulfillSettlementPaymentIntentSucceeded: vi.fn(),
  fulfillSettlementPaymentIntentPaymentFailed: vi.fn(),
}));

const serviceRoleMocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  serverError: vi.fn((message: string) => Response.json({ error: message }, { status: 500 })),
}));

vi.mock("@/lib/stripe/server", () => stripeServerMocks);
vi.mock("@/lib/supabase/service-role", () => serviceRoleMocks);
vi.mock("@/api-shared/route-helpers", () => routeHelperMocks);

import { POST } from "./route";

function requestWithSignature() {
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "stripe-signature": "sig_test",
    },
    body: "{}",
  });
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceRoleMocks.createServiceRoleClient.mockReturnValue({ client: "service-role" });
  });

  it("returns 200 ack for non-retryable setup outcomes", async () => {
    stripeServerMocks.parseAndVerifyStripeWebhook.mockResolvedValue({
      id: "evt_setup",
      type: "checkout.session.completed",
    } as Stripe.Event);
    stripeServerMocks.fulfillCheckoutSetupSessionCompleted.mockResolvedValue({
      status: "ignored",
      reason: "missing_order_id",
    });

    const response = await POST(requestWithSignature());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
  });

  it("returns 200 ack for non-retryable settlement outcomes", async () => {
    stripeServerMocks.parseAndVerifyStripeWebhook.mockResolvedValue({
      id: "evt_settlement",
      type: "payment_intent.succeeded",
    } as Stripe.Event);
    stripeServerMocks.fulfillSettlementPaymentIntentSucceeded.mockResolvedValue({
      status: "ignored",
      reason: "order_not_found",
    });

    const response = await POST(requestWithSignature());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
  });

  it("returns 500 for retryable setup failures when fulfillment throws", async () => {
    stripeServerMocks.parseAndVerifyStripeWebhook.mockResolvedValue({
      id: "evt_setup_retry",
      type: "checkout.session.completed",
    } as Stripe.Event);
    stripeServerMocks.fulfillCheckoutSetupSessionCompleted.mockRejectedValue(
      new Error("Could not record Stripe webhook event: timeout"),
    );

    const response = await POST(requestWithSignature());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong. Please try again." });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });

  it("returns 500 for retryable settlement failures when fulfillment throws", async () => {
    stripeServerMocks.parseAndVerifyStripeWebhook.mockResolvedValue({
      id: "evt_settlement_retry",
      type: "payment_intent.succeeded",
    } as Stripe.Event);
    stripeServerMocks.fulfillSettlementPaymentIntentSucceeded.mockRejectedValue(
      new Error("Could not transition order to paid after settlement"),
    );

    const response = await POST(requestWithSignature());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong. Please try again." });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });
});
