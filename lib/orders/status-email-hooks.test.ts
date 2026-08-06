import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActivityBooking } from "@/lib/activity-bookings/service";
import type { AccommodationBooking } from "@/lib/accommodation-bookings/service";
import type { Order } from "@/lib/orders/types";
import type { Database } from "@/supabase/types/database";

const workerMocks = vi.hoisted(() => ({
  processNotificationMessage: vi.fn(),
}));

vi.mock("@/lib/notifications/email-worker", () => workerMocks);
import {
  sendBookingStatusEmailHook,
  sendOrderStatusEmailHook,
} from "./status-email-hooks";

vi.mock("@/lib/activity-bookings/service", () => ({
  getActivityBookingById: vi.fn(),
}));

vi.mock("@/lib/accommodation-bookings/service", () => ({
  getAccommodationBookingById: vi.fn(),
}));

vi.mock("@/lib/orders/service", () => ({
  getOrderById: vi.fn(),
}));

import { getActivityBookingById } from "@/lib/activity-bookings/service";
import { getAccommodationBookingById } from "@/lib/accommodation-bookings/service";
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

const baseAccommodationBooking: AccommodationBooking = {
  id: "stay-1",
  accommodation_id: "accommodation-1",
  check_in: "2026-02-01",
  check_out: "2026-02-05",
  created_at: "2026-01-01T00:00:00.000Z",
  discount_cents: 0,
  expires_at: "2026-01-02T00:00:00.000Z",
  guests: 2,
  order_id: "order-1",
  status: "confirmed",
  subtotal_cents: 10000,
  total_cents: 10000,
  unit_price_cents: 2500,
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
  const supabase = {
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
      if (table === "accommodations") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { name: "Ocean View Suite" },
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
      if (table === "accommodation_bookings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: "stay-1", status: "confirmed" }],
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
    __getInsertedNotification: () => insertedNotification,
  };
  return supabase as unknown as SupabaseClient<Database> & {
    __getInsertedNotification: () => Record<string, unknown> | null;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  workerMocks.processNotificationMessage.mockResolvedValue("sent");
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
  it("keeps the event queued when delivery is disabled", async () => {
    workerMocks.processNotificationMessage.mockResolvedValue("pending");
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);
    const supabase = makeSupabase();

    const result = await sendOrderStatusEmailHook(supabase, {
      orderId: "order-1",
      event: "payment_completed",
    });

    expect(result).toEqual({ delivered: false, reason: "queued" });
    expect(supabase.__getInsertedNotification()).toEqual(
      expect.objectContaining({ event_type: "payment_completed" }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates a booking event with recipient and booking context", async () => {
    vi.mocked(getActivityBookingById).mockResolvedValue(baseBooking);
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);
    const supabase = makeSupabase();

    const result = await sendBookingStatusEmailHook(supabase, {
      bookingId: "booking-1",
      event: "booking_confirmed",
    });

    expect(result).toEqual({ delivered: true });
    expect(getActivityBookingById).toHaveBeenCalled();
    expect(getOrderById).toHaveBeenCalledWith(expect.anything(), "order-1");
    expect(supabase.__getInsertedNotification()).toEqual(
      expect.objectContaining({
        dedupe_key: "booking:booking-1:booking_confirmed",
        payload: expect.objectContaining({
          recipient: expect.objectContaining({ email: "traveler@example.com" }),
          booking: expect.objectContaining({ activityTitle: "Sunset Cruise" }),
        }),
      }),
    );
  });

  it("does not use the removed legacy status webhook", async () => {
    vi.mocked(getActivityBookingById).mockResolvedValue(baseBooking);
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);
    vi.stubEnv("STATUS_EMAIL_WEBHOOK_URL", "https://example.com/legacy");

    const result = await sendBookingStatusEmailHook(makeSupabase(), {
      bookingId: "booking-1",
      event: "booking_confirmed",
    });

    expect(result).toEqual({ delivered: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(workerMocks.processNotificationMessage).toHaveBeenCalledOnce();
  });

  it("creates an accommodation booking event with stay context", async () => {
    vi.mocked(getAccommodationBookingById).mockResolvedValue(
      baseAccommodationBooking,
    );
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);
    const supabase = makeSupabase();

    const result = await sendBookingStatusEmailHook(supabase, {
      bookingId: "stay-1",
      event: "booking_confirmed",
      lineType: "accommodation",
    });

    expect(result).toEqual({ delivered: true });
    expect(supabase.__getInsertedNotification()).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          booking: expect.objectContaining({
            lineType: "accommodation",
            accommodationTitle: "Ocean View Suite",
            guests: 2,
          }),
        }),
      }),
    );
  });

  it("creates order events with activity and accommodation summaries", async () => {
    vi.mocked(getOrderById).mockResolvedValue(baseOrder);
    const supabase = makeSupabase();

    const result = await sendOrderStatusEmailHook(supabase, {
      orderId: "order-1",
      event: "payment_failed",
    });

    expect(result).toEqual({ delivered: true });
    expect(supabase.__getInsertedNotification()).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          event: "payment_failed",
          order: expect.objectContaining({
            bookingCount: 3,
            bookingStatuses: expect.arrayContaining([
              expect.objectContaining({ lineType: "activity" }),
              expect.objectContaining({ lineType: "accommodation" }),
            ]),
          }),
        }),
      }),
    );
  });
});
