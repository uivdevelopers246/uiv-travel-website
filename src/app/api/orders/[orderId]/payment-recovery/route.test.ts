import { beforeEach, describe, expect, it, vi } from "vitest";

const activityBookingServiceMocks = vi.hoisted(() => ({
  listActivityBookings: vi.fn(),
}));

const orderServiceMocks = vi.hoisted(() => ({
  getOrderById: vi.fn(),
}));

const stripeServerMocks = vi.hoisted(() => ({
  createPaymentMethodUpdateSessionForOrder: vi.fn(),
  ensureStripeCustomerForOrder: vi.fn(),
  getPublicSiteUrl: vi.fn(),
}));

const supabaseServerMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  badRequest: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 400 }),
  ),
  parseUuidParam: vi.fn(),
  requireSameOriginPost: vi.fn(() => null),
  requireRole: vi.fn(),
  serverError: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 500 }),
  ),
  unauthorized: vi.fn((message = "Unauthorized") =>
    Response.json({ error: message }, { status: 401 }),
  ),
}));

vi.mock("@/lib/activity-bookings/service", () => activityBookingServiceMocks);
vi.mock("@/lib/orders/service", () => orderServiceMocks);
vi.mock("@/lib/stripe/server", () => stripeServerMocks);
vi.mock("@/lib/supabase/server", () => supabaseServerMocks);
vi.mock("@/api-shared/route-helpers", () => routeHelperMocks);

import { POST } from "./route";

const ORDER_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

function createSupabaseClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: USER_ID,
          },
        },
      }),
    },
  };
}

function createFailedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    user_id: USER_ID,
    status: "failed",
    settlement_charge_attempt_count: 2,
    currency: "usd",
    ...overrides,
  };
}

async function invokePost() {
  return POST(new Request("http://localhost/api/orders/payment-recovery", {
    method: "POST",
  }), {
    params: Promise.resolve({ orderId: ORDER_ID }),
  });
}

describe("POST /api/orders/[orderId]/payment-recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseServerMocks.createClient.mockResolvedValue(createSupabaseClient());
    routeHelperMocks.parseUuidParam.mockReturnValue({ id: ORDER_ID });
    routeHelperMocks.requireRole.mockResolvedValue({ role: "user" });
    orderServiceMocks.getOrderById.mockResolvedValue(createFailedOrder());
    activityBookingServiceMocks.listActivityBookings.mockResolvedValue([
      { id: "booking-1", status: "confirmed" },
    ]);
    stripeServerMocks.getPublicSiteUrl.mockReturnValue("http://localhost:3000");
    stripeServerMocks.ensureStripeCustomerForOrder.mockResolvedValue("cus_123");
    stripeServerMocks.createPaymentMethodUpdateSessionForOrder.mockResolvedValue({
      url: "https://checkout.stripe.com/session/test",
    });
  });

  it("returns a generic 500 when Stripe customer setup throws a config error", async () => {
    stripeServerMocks.ensureStripeCustomerForOrder.mockRejectedValue(
      new Error("STRIPE_SECRET_KEY environment variable is not set"),
    );

    const response = await invokePost();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Something went wrong. Please try again.",
    });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });

  it("returns a generic 500 when session creation throws an internal error", async () => {
    stripeServerMocks.createPaymentMethodUpdateSessionForOrder.mockRejectedValue(
      new Error("Could not persist Stripe customer on order: duplicate key value"),
    );

    const response = await invokePost();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Something went wrong. Please try again.",
    });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });

  it("returns unauthorized when the route catches an Unauthorized error", async () => {
    orderServiceMocks.getOrderById.mockRejectedValue(new Error("Unauthorized"));

    const response = await invokePost();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(routeHelperMocks.unauthorized).toHaveBeenCalled();
  });

  it("returns the recovery URL on the happy path", async () => {
    const response = await invokePost();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      url: "https://checkout.stripe.com/session/test",
    });
  });

  it("rejects cross-origin recovery posts before loading the order", async () => {
    routeHelperMocks.requireSameOriginPost.mockReturnValueOnce(
      Response.json({ error: "Cross-origin request blocked" }, { status: 403 }),
    );

    const response = await POST(new Request("http://localhost/api/orders/payment-recovery", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }), {
      params: Promise.resolve({ orderId: ORDER_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Cross-origin request blocked" });
    expect(routeHelperMocks.parseUuidParam).not.toHaveBeenCalled();
    expect(orderServiceMocks.getOrderById).not.toHaveBeenCalled();
  });

  it("preserves the existing eligibility validation response", async () => {
    orderServiceMocks.getOrderById.mockResolvedValue(
      createFailedOrder({ status: "payment_pending" }),
    );

    const response = await invokePost();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Order is not eligible for payment recovery.",
    });
    expect(routeHelperMocks.badRequest).toHaveBeenCalledWith(
      "Order is not eligible for payment recovery.",
    );
  });
});
