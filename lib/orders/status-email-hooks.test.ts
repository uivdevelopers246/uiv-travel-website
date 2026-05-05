import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityBooking } from "@/lib/activity-bookings/service";
import type { Order } from "@/lib/orders/types";
import {
  sendBookingStatusEmailHook,
  sendOrderStatusEmailHook,
} from "./status-email-hooks";

vi.mock("@/lib/activity-bookings/service", () => ({
  getActivityBookingById: vi.fn(),
}));

vi.mock("@/lib/orders/service", () => ({
  getOrderById: vi.fn(),
}));

import { getActivityBookingById } from "@/lib/activity-bookings/service";
import { getOrderById } from "@/lib/orders/service";

const baseOrder: Order = {
  id: "order-1",
  user_id: "user-1",
  status: "paid",
  currency: "usd",
  subtotal_cents: 10000,
  discount_cents: 0,
  total_cents: 10000,
  stripe_checkout_session_id: null,
  stripe_payment_intent_id: "pi_1",
  stripe_customer_id: "cus_1",
  stripe_setup_intent_id: "seti_1",
  settlement_charge_attempt_count: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const baseBooking: ActivityBooking = {
  id: "booking-1",
  activity_id: "activity-1",
  created_at: "2026-01-01T00:00:00.000Z",
  discount_cents: 0,
  expires_at: "2026-01-02T00:00:00.000Z",
  order_id: "order-1",
  participants: 2,
  slot_id: "slot-1",
  status: "confirmed",
  subtotal_cents: 10000,
  total_cents: 10000,
  unit_price_cents: 5000,
  updated_at: "2026-01-01T00:00:00.000Z",
  user_id: "user-1",
  vendor_id: "vendor-1",
};

function makeSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { display_name: "Taylor" },
            error: null,
          }),
        };
      }
      if (table === "availability_slots") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              starts_at: "2026-01-05T15:00:00.000Z",
              ends_at: "2026-01-05T17:00:00.000Z",
            },
            error: null,
          }),
        };
      }
      if (table === "activities") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { title: "Sunset Cruise" },
            error: null,
          }),
        };
      }
      if (table === "activity_bookings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: "booking-1", status: "confirmed" },
              { id: "booking-2", status: "declined" },
            ],
            error: null,
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { email: "traveler@example.com" } },
          error: null,
        }),
      },
    },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STATUS_EMAIL_WEBHOOK_URL", "https://example.com/hooks/status-email");
  vi.stubEnv("STATUS_EMAIL_WEBHOOK_SECRET", "status-secret");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }),
  );
});

describe("status-email-hooks", () => {
  it("skips delivery when no webhook is configured", async () => {
    vi.stubEnv("STATUS_EMAIL_WEBHOOK_URL", "");
    vi.stubEnv("STATUS_EMAIL_WEBHOOK_SECRET", "");

    const result = await sendOrderStatusEmailHook(makeSupabase(), {
      orderId: "order-1",
      event: "payment_completed",
    });

    expect(result).toEqual({
      delivered: false,
      reason: "not_configured",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts booking status payloads to the configured webhook", async () => {
    vi.mocked(getActivityBookingById).mockResolvedValue(baseBooking);
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);

    const result = await sendBookingStatusEmailHook(makeSupabase(), {
      bookingId: "booking-1",
      event: "booking_confirmed",
    });

    expect(result).toEqual({ delivered: true });
    expect(getActivityBookingById).toHaveBeenCalled();
    expect(getOrderById).toHaveBeenCalledWith(expect.anything(), "order-1");
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/hooks/status-email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer status-secret",
          "content-type": "application/json",
        }),
      }),
    );
  });

  it("posts order status payloads with booking summaries", async () => {
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);

    const result = await sendOrderStatusEmailHook(makeSupabase(), {
      orderId: "order-1",
      event: "payment_failed",
    });

    expect(result).toEqual({ delivered: true });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/hooks/status-email",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"event":"payment_failed"'),
      }),
    );
  });
});
