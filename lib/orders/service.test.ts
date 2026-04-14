import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cart/service", () => ({
  listCartLines: vi.fn(),
}));

import { listCartLines } from "@/lib/cart/service";
import { CART_LINE_TYPE_ACTIVITY } from "@/lib/cart/constants";
import type { CartLine } from "@/lib/cart/types";
import {
  computeOrderTotalsFromCartLines,
  findAwaitingPaymentOrderForUser,
  getOrderById,
  updateOrderStatus,
  updateOrderStripeCheckoutSession,
  upsertAwaitingPaymentOrderFromCart,
} from "./service";
import type { Order } from "./types";

const userId = "user-1";
const orderId = "order-1";
const slotId = "slot-1";

function authUser() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
  };
}

function baseCartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: "line-1",
    user_id: userId,
    line_type: CART_LINE_TYPE_ACTIVITY,
    slot_id: slotId,
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

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: orderId,
    user_id: userId,
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
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(listCartLines).mockReset();
});

describe("computeOrderTotalsFromCartLines", () => {
  it("returns zero cents for an empty cart", () => {
    expect(computeOrderTotalsFromCartLines([])).toEqual({
      subtotal_cents: 0,
      discount_cents: 0,
      total_cents: 0,
    });
  });

  it("sums line_total_cents across multiple lines", () => {
    const lines = [
      baseCartLine({ id: "a", line_total_cents: 5000 }),
      baseCartLine({ id: "b", line_total_cents: 3000 }),
    ];
    expect(computeOrderTotalsFromCartLines(lines)).toEqual({
      subtotal_cents: 8000,
      discount_cents: 0,
      total_cents: 8000,
    });
  });

  it("clamps negative net subtotal to zero", () => {
    const lines = [
      baseCartLine({ line_total_cents: -100 }),
      baseCartLine({ line_total_cents: 50 }),
    ];
    expect(computeOrderTotalsFromCartLines(lines)).toEqual({
      subtotal_cents: 0,
      discount_cents: 0,
      total_cents: 0,
    });
  });
});

describe("findAwaitingPaymentOrderForUser", () => {
  it("returns null when no awaiting_payment row exists", async () => {
    const ordersQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => ordersQuery),
      ...authUser(),
    };

    const row = await findAwaitingPaymentOrderForUser(supabase as never);
    expect(row).toBeNull();
    expect(ordersQuery.order).toHaveBeenCalledWith("updated_at", {
      ascending: false,
    });
    expect(ordersQuery.limit).toHaveBeenCalledWith(1);
  });

  it("returns the most recently updated row", async () => {
    const order = baseOrder();
    const ordersQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => ordersQuery),
      ...authUser(),
    };

    const row = await findAwaitingPaymentOrderForUser(supabase as never);
    expect(row).toEqual(order);
  });

  it("throws Unauthorized when getUser returns no user", async () => {
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };

    await expect(findAwaitingPaymentOrderForUser(supabase as never)).rejects.toThrow(
      "Unauthorized",
    );
  });
});

describe("upsertAwaitingPaymentOrderFromCart", () => {
  it("inserts a new awaiting_payment order when none exists", async () => {
    const line = baseCartLine();
    vi.mocked(listCartLines).mockResolvedValue([line]);

    const inserted = baseOrder({
      id: "new-order",
      subtotal_cents: 10000,
      total_cents: 10000,
    });

    const findQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertQuery: Record<string, unknown> = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
    };

    const supabase: Record<string, unknown> = {
      from: vi
        .fn()
        .mockImplementationOnce(() => findQuery)
        .mockImplementationOnce(() => insertQuery),
      ...authUser(),
    };

    const row = await upsertAwaitingPaymentOrderFromCart(supabase as never);
    expect(row).toEqual(inserted);
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        status: "awaiting_payment",
        currency: "usd",
        subtotal_cents: 10000,
        discount_cents: 0,
        total_cents: 10000,
      }),
    );
  });

  it("updates totals on an existing awaiting_payment order", async () => {
    const line = baseCartLine({ line_total_cents: 15000 });
    vi.mocked(listCartLines).mockResolvedValue([line]);

    const existing = baseOrder({
      id: orderId,
      subtotal_cents: 10000,
      total_cents: 10000,
    });
    const updated = baseOrder({
      id: orderId,
      subtotal_cents: 15000,
      total_cents: 15000,
    });

    const findQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
    };
    const updateQuery: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updated, error: null }),
    };

    const supabase: Record<string, unknown> = {
      from: vi
        .fn()
        .mockImplementationOnce(() => findQuery)
        .mockImplementationOnce(() => updateQuery),
      ...authUser(),
    };

    const row = await upsertAwaitingPaymentOrderFromCart(supabase as never);
    expect(row).toEqual(updated);
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal_cents: 15000,
        discount_cents: 0,
        total_cents: 15000,
        currency: "usd",
      }),
    );
    expect(updateQuery.eq).toHaveBeenCalledWith("id", orderId);
  });

  it("throws Cart is empty when there are no cart lines", async () => {
    vi.mocked(listCartLines).mockResolvedValue([]);
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      ...authUser(),
    };

    await expect(upsertAwaitingPaymentOrderFromCart(supabase as never)).rejects.toThrow(
      "Cart is empty",
    );
  });

  it("throws Unauthorized when getUser returns no user", async () => {
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };

    await expect(upsertAwaitingPaymentOrderFromCart(supabase as never)).rejects.toThrow(
      "Unauthorized",
    );
    expect(listCartLines).not.toHaveBeenCalled();
  });
});

describe("updateOrderStripeCheckoutSession", () => {
  it("sets stripe_checkout_session_id and returns the row", async () => {
    const updated = baseOrder({
      stripe_checkout_session_id: "cs_test_123",
    });
    const ordersQuery: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: updated, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => ordersQuery),
      ...authUser(),
    };

    const row = await updateOrderStripeCheckoutSession(supabase as never, {
      orderId,
      stripeCheckoutSessionId: "cs_test_123",
    });
    expect(row).toEqual(updated);
    expect(ordersQuery.update).toHaveBeenCalledWith({
      stripe_checkout_session_id: "cs_test_123",
    });
  });

  it("throws Order not found when update returns no row", async () => {
    const ordersQuery: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => ordersQuery),
      ...authUser(),
    };

    await expect(
      updateOrderStripeCheckoutSession(supabase as never, {
        orderId,
        stripeCheckoutSessionId: "cs_x",
      }),
    ).rejects.toThrow("Order not found");
  });
});

describe("getOrderById", () => {
  it("returns the order when present", async () => {
    const order = baseOrder();
    const ordersQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => ordersQuery),
    };

    const row = await getOrderById(supabase as never, orderId);
    expect(row).toEqual(order);
  });

  it("returns null when not found", async () => {
    const ordersQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => ordersQuery),
    };

    const row = await getOrderById(supabase as never, orderId);
    expect(row).toBeNull();
  });
});

describe("updateOrderStatus", () => {
  it("updates status and returns the row", async () => {
    const updated = baseOrder({ status: "paid" });
    const ordersQuery: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: updated, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => ordersQuery),
    };

    const row = await updateOrderStatus(supabase as never, orderId, "paid");
    expect(row).toEqual(updated);
    expect(ordersQuery.update).toHaveBeenCalledWith({ status: "paid" });
  });

  it("throws Order not found when no row is updated", async () => {
    const ordersQuery: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => ordersQuery),
    };

    await expect(
      updateOrderStatus(supabase as never, orderId, "paid"),
    ).rejects.toThrow("Order not found");
  });

  it("throws on invalid status without calling the database", async () => {
    const from = vi.fn();
    const supabase: Record<string, unknown> = { from };

    await expect(
      updateOrderStatus(supabase as never, orderId, "bogus" as never),
    ).rejects.toThrow("Invalid order status");
    expect(from).not.toHaveBeenCalled();
  });
});
