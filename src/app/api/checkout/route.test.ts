import { beforeEach, describe, expect, it, vi } from "vitest";

const cartServiceMocks = vi.hoisted(() => ({
  listCartLines: vi.fn(),
  validateActivityCartForCheckout: vi.fn(),
}));

const orderServiceMocks = vi.hoisted(() => ({
  updateOrderStripeCheckoutSession: vi.fn(),
  upsertCheckoutSetupOrderFromCart: vi.fn(),
}));

const stripeServerMocks = vi.hoisted(() => ({
  createCheckoutSetupSessionForOrder: vi.fn(),
  ensureStripeCustomerForOrder: vi.fn(),
  getPublicSiteUrl: vi.fn(),
}));

const supabaseServerMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  badRequest: vi.fn((message: string) => Response.json({ error: message }, { status: 400 })),
  notFound: vi.fn((message: string) => Response.json({ error: message }, { status: 404 })),
  requireSameOriginPost: vi.fn(() => null),
  requireRole: vi.fn(),
  serverError: vi.fn((message: string) => Response.json({ error: message }, { status: 500 })),
}));

vi.mock("@/lib/cart/service", () => cartServiceMocks);
vi.mock("@/lib/orders/service", () => orderServiceMocks);
vi.mock("@/lib/stripe/server", () => stripeServerMocks);
vi.mock("@/lib/supabase/server", () => supabaseServerMocks);
vi.mock("@/api-shared/route-helpers", () => routeHelperMocks);
vi.mock("@/api-shared/cart-route-errors", () => ({
  handleCartRouteError: vi.fn(() =>
    Response.json({ error: "Something went wrong. Please try again." }, { status: 500 }),
  ),
}));

import { POST } from "./route";

describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseServerMocks.createClient.mockResolvedValue({ client: "supabase" });
    routeHelperMocks.requireRole.mockResolvedValue({ role: "user" });
  });

  it("returns a specific configuration error when Stripe is not configured", async () => {
    cartServiceMocks.validateActivityCartForCheckout.mockResolvedValue(undefined);
    orderServiceMocks.upsertCheckoutSetupOrderFromCart.mockResolvedValue({
      id: "order-1",
    });
    cartServiceMocks.listCartLines.mockResolvedValue([]);
    stripeServerMocks.getPublicSiteUrl.mockReturnValue("http://localhost:3000");
    stripeServerMocks.ensureStripeCustomerForOrder.mockRejectedValue(
      new Error("STRIPE_SECRET_KEY environment variable is not set"),
    );

    const response = await POST(new Request("http://localhost/api/checkout", {
      method: "POST",
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error:
        "Checkout is not configured. Add STRIPE_SECRET_KEY to the server environment and try again.",
    });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Checkout is not configured. Add STRIPE_SECRET_KEY to the server environment and try again.",
    );
  });

  it("rejects cross-origin checkout posts before creating a session", async () => {
    routeHelperMocks.requireSameOriginPost.mockReturnValueOnce(
      Response.json({ error: "Cross-origin request blocked" }, { status: 403 }),
    );

    const response = await POST(new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Cross-origin request blocked" });
    expect(supabaseServerMocks.createClient).not.toHaveBeenCalled();
  });
});
