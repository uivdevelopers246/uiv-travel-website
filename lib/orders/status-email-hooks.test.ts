import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActivityBooking } from "@/lib/activity-bookings/service";
import type { Order } from "@/lib/orders/types";
import type { Database } from "@/supabase/types/database";
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
  let insertedNotification: Record<string, unknown> | null = null;
  const notificationInsertResult = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: insertedNotification ?? {
        id: "notification-1",
        user_id: "user-1",
        channel: "email",
        event_type: "payment_failed",
        status: "pending",
        payload: {},
        dedupe_key: "dedupe-1",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
      }),
    ),
  };
  const notificationUpdateResult = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "notification_events") {
        return {
          insert: vi.fn((value) => {
            insertedNotification = {
              id: "notification-1",
              status: "pending",
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              ...value,
            };
            return notificationInsertResult;
          }),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: notificationInsertResult.single,
          update: vi.fn(() => notificationUpdateResult),
        };
      }
      if (table === "notification_preferences") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              email_enabled: true,
              daily_digest_enabled: true,
              booking_updates_enabled: true,
              provider_updates_enabled: true,
              email_suppressed_at: null,
              email_suppressed_reason: null,
              email_suppressed_address: null,
            },
            error: null,
          }),
        };
      }
      if (table === "email_delivery_events") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
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
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STATUS_EMAIL_WEBHOOK_URL", "https://example.com/hooks/status-email");
  vi.stubEnv("STATUS_EMAIL_WEBHOOK_SECRET", "status-secret");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"messageId":"provider-message-1"}'),
    }),
  );
});

describe("status-email-hooks", () => {
  it("skips delivery when no webhook is configured", async () => {
    vi.stubEnv("STATUS_EMAIL_WEBHOOK_URL", "");
    vi.stubEnv("STATUS_EMAIL_WEBHOOK_SECRET", "");
    vi.stubEnv("EMAIL_DELIVERY_WEBHOOK_URL", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);

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

  it("sends booking status payloads through Resend when configured", async () => {
    vi.mocked(getActivityBookingById).mockResolvedValue(baseBooking);
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);
    vi.stubEnv("STATUS_EMAIL_WEBHOOK_URL", "");
    vi.stubEnv("STATUS_EMAIL_WEBHOOK_SECRET", "");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "UIV Travel <bookings@example.com>");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"id":"resend-email-1"}'),
    } as unknown as Response);

    const result = await sendBookingStatusEmailHook(makeSupabase(), {
      bookingId: "booking-1",
      event: "booking_confirmed",
    });

    expect(result).toEqual({ delivered: true });
    expect(getActivityBookingById).toHaveBeenCalled();
    expect(getOrderById).toHaveBeenCalledWith(expect.anything(), "order-1");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer re_test",
          "idempotency-key": "booking:booking-1:booking_confirmed",
        }),
        body: expect.stringContaining('"to":"traveler@example.com"'),
      }),
    );
  });

  it("uses the configured legacy webhook when present", async () => {
    vi.mocked(getActivityBookingById).mockResolvedValue(baseBooking);
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);

    const result = await sendBookingStatusEmailHook(makeSupabase(), {
      bookingId: "booking-1",
      event: "booking_confirmed",
    });

    expect(result).toEqual({ delivered: true });
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
