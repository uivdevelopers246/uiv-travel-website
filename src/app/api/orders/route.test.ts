import { beforeEach, describe, expect, it, vi } from "vitest";

const orderServiceMocks = vi.hoisted(() => ({
  listOrdersWithActivityBookingsPreview: vi.fn(),
}));

const stripeServerMocks = vi.hoisted(() => ({
  getOrderPaymentSummary: vi.fn(),
}));

const supabaseServerMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  badRequest: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 400 }),
  ),
  parseUuidParam: vi.fn(),
  requireRole: vi.fn(),
  serverError: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 500 }),
  ),
  unauthorized: vi.fn((message = "Unauthorized") =>
    Response.json({ error: message }, { status: 401 }),
  ),
}));

vi.mock("@/lib/orders/service", () => orderServiceMocks);
vi.mock("@/lib/stripe/server", () => stripeServerMocks);
vi.mock("@/lib/supabase/server", () => supabaseServerMocks);
vi.mock("@/api-shared/route-helpers", () => routeHelperMocks);

import { GET } from "./route";

const FILTERED_ORDER_ID = "11111111-1111-1111-1111-111111111111";

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: FILTERED_ORDER_ID,
    user_id: "user-1",
    status: "payment_pending",
    currency: "usd",
    subtotal_cents: 10000,
    discount_cents: 0,
    total_cents: 10000,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: "pi_123",
    stripe_customer_id: null,
    stripe_setup_intent_id: null,
    settlement_charge_attempt_count: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    activity_bookings: [],
    ...overrides,
  };
}

describe("GET /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseServerMocks.createClient.mockResolvedValue({ client: "supabase" });
    routeHelperMocks.requireRole.mockResolvedValue({ role: "user" });
    routeHelperMocks.parseUuidParam.mockReturnValue({ id: FILTERED_ORDER_ID });
  });

  it("filters by orderId and hydrates payment summary only for returned rows", async () => {
    const order = makeOrder();
    const paymentSummary = {
      status: "processing",
      receipt_url: null,
      failure_message: null,
      can_retry_with_payment_method_update: false,
      show_contact_support: false,
    };
    orderServiceMocks.listOrdersWithActivityBookingsPreview.mockResolvedValue([order]);
    stripeServerMocks.getOrderPaymentSummary.mockResolvedValue(paymentSummary);

    const response = await GET(
      new Request(`http://localhost/api/orders?orderId=${FILTERED_ORDER_ID}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeHelperMocks.parseUuidParam).toHaveBeenCalledWith(
      FILTERED_ORDER_ID,
      "order",
    );
    expect(orderServiceMocks.listOrdersWithActivityBookingsPreview).toHaveBeenCalledWith(
      { client: "supabase" },
      { orderId: FILTERED_ORDER_ID },
    );
    expect(stripeServerMocks.getOrderPaymentSummary).toHaveBeenCalledTimes(1);
    expect(stripeServerMocks.getOrderPaymentSummary).toHaveBeenCalledWith(order);
    expect(body).toEqual([
      {
        ...order,
        payment_summary: paymentSummary,
      },
    ]);
  });
});
