import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";
import {
  processNotificationMessage,
  processQueuedNotificationEmails,
  renderNotificationEmail,
} from "./email-worker";
import type { NotificationConfig } from "./config";
import { NotificationDeliveryError } from "./delivery-error";

const testConfig: NotificationConfig = {
  appEnv: "local",
  deliveryEnabled: true,
  transport: "resend",
  recipientPolicy: "unrestricted",
  recipientAllowlist: new Set(),
};

const basePayload = {
  recipient: {
    email: "traveler@example.com",
    displayName: "Taylor",
  },
  order: {
    id: "order-1",
    status: "paid",
    currency: "usd",
    totalCents: 12500,
  },
  booking: {
    id: "booking-1",
    activityTitle: "Sunset Cruise",
    slotStartsAt: "2026-01-05T15:00:00.000Z",
    participants: 2,
  },
  provider: {
    name: "Island Adventures",
    email: "provider@example.com",
  },
  summary: {
    newBookings: 1,
    pendingApprovals: 1,
    expiringApprovals: 0,
    confirmedBookings: 1,
    declinedBookings: 0,
    failedPayments: 0,
  },
};

const allEventTypes = [
  "booking_confirmed",
  "booking_declined",
  "booking_expired",
  "payment_completed",
  "payment_failed",
  "order_receipt",
  "provider_booking_pending",
  "daily_digest",
] as const;

function makeSupabase(overrides: {
  notificationStatus?: string;
  eventType?: string;
  preferences?: Record<string, boolean | string | null> | null;
  attemptCount?: number;
} = {}) {
  const updates: unknown[] = [];
  const inserts: unknown[] = [];
  const notification = {
    id: "notification-1",
    user_id: "user-1",
    channel: "email",
    event_type: overrides.eventType ?? "booking_confirmed",
    status: overrides.notificationStatus ?? "published",
    payload: basePayload,
    dedupe_key: "booking:booking-1:booking_confirmed",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    attempt_count: overrides.attemptCount ?? 0,
    next_attempt_at: "2026-01-01T00:00:00.000Z",
    claimed_at: null,
    claim_token: null,
    last_attempt_at: null,
    status_reason: null,
  };

  const updateResult = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({
      data: [{ id: "notification-1" }],
      error: null,
    }),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "notification_events") {
        const listQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: "notification-1" }],
            error: null,
          }),
        };
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: listQuery.in,
          order: listQuery.order,
          limit: listQuery.limit,
          single: vi.fn().mockResolvedValue({ data: notification, error: null }),
          update: vi.fn((value) => {
            updates.push(value);
            return updateResult;
          }),
        };
      }
      if (table === "notification_preferences") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: overrides.preferences ?? {
              email_enabled: true,
              daily_digest_enabled: false,
              booking_updates_enabled: true,
              provider_updates_enabled: true,
            },
            error: null,
          }),
        };
      }
      if (table === "email_delivery_events") {
        return {
          insert: vi.fn((value) => {
            inserts.push(value);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            ...notification,
            status: "processing",
            attempt_count: overrides.attemptCount ?? 1,
            claimed_at: "2026-01-01T00:00:00.000Z",
            claim_token: "00000000-0000-4000-8000-000000000001",
            last_attempt_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        error: null,
      }),
    ),
    __updates: updates,
    __inserts: inserts,
  };
  return supabase as unknown as SupabaseClient<Database> & {
    __updates: unknown[];
    __inserts: unknown[];
  };
}

describe("email-worker", () => {
  it("renders MJML and plain text templates", async () => {
    const rendered = await renderNotificationEmail("booking_confirmed", basePayload);

    expect(rendered.subject).toContain("Sunset Cruise");
    expect(rendered.html).toContain("Booking confirmed");
    expect(rendered.text).toContain("Experience: Sunset Cruise");
  });

  it.each(allEventTypes)("renders the %s template", async (eventType) => {
    const rendered = await renderNotificationEmail(eventType, basePayload);

    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.html).toContain("<!doctype html>");
    expect(rendered.text.trim().length).toBeGreaterThan(0);
  });

  it.each([
    "booking_confirmed",
    "booking_declined",
    "booking_expired",
    "provider_booking_pending",
  ] as const)("renders accommodation details in the %s template", async (eventType) => {
    const rendered = await renderNotificationEmail(eventType, {
      ...basePayload,
      booking: {
        id: "stay-1",
        accommodationTitle: "Ocean View Suite",
        checkIn: "2026-02-01",
        checkOut: "2026-02-05",
        guests: 2,
      },
    });

    expect(rendered.subject).toContain("Ocean View Suite");
    expect(rendered.text).toContain("Stay: Ocean View Suite");
    expect(rendered.html).toContain("Ocean View Suite");
  });

  it("sends through the configured adapter, stores the provider message id, and marks the event sent", async () => {
    const supabase = makeSupabase();
    const sendEmail = vi.fn().mockResolvedValue({
      messageId: "provider-message-1",
      rawResponse: { status: 200 },
    });

    await processNotificationMessage(
      supabase,
      {
        notificationId: "notification-1",
      },
      { sendEmail, config: testConfig },
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "traveler@example.com",
        idempotencyKey: "booking:booking-1:booking_confirmed",
        subject: expect.stringContaining("Sunset Cruise"),
      }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith("claim_notification_events", {
      p_limit: 1,
      p_claim_token: expect.any(String),
      p_notification_id: "notification-1",
      p_lease_seconds: 300,
    });
    expect(supabase.__inserts).toEqual([
      expect.objectContaining({
        notification_id: "notification-1",
        provider_message_id: "provider-message-1",
        event_type: "send",
      }),
    ]);
    expect(supabase.__updates).toContainEqual(
      expect.objectContaining({ status: "sent", claim_token: null }),
    );
  });

  it("sends transactional booking email even when optional booking updates are disabled", async () => {
    const supabase = makeSupabase({
      preferences: {
        email_enabled: true,
        daily_digest_enabled: false,
        booking_updates_enabled: false,
        provider_updates_enabled: true,
      },
    });
    const sendEmail = vi.fn().mockResolvedValue({
      messageId: "provider-message-1",
      rawResponse: { status: 200 },
    });

    await processNotificationMessage(
      supabase,
      {
        notificationId: "notification-1",
      },
      { sendEmail, config: testConfig },
    );

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(supabase.__updates).toContainEqual(
      expect.objectContaining({ status: "sent" }),
    );
  });

  it("marks daily digest skipped when optional digest email is disabled", async () => {
    const supabase = makeSupabase({
      eventType: "daily_digest",
      preferences: {
        email_enabled: true,
        daily_digest_enabled: false,
        booking_updates_enabled: true,
        provider_updates_enabled: true,
      },
    });
    const sendEmail = vi.fn();

    await processNotificationMessage(
      supabase,
      {
        notificationId: "notification-1",
      },
      { sendEmail, config: testConfig },
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(supabase.__updates).toContainEqual(
      expect.objectContaining({
        status: "skipped",
        status_reason: "daily_digest_disabled",
      }),
    );
  });

  it("marks transactional email skipped when the address is system suppressed", async () => {
    const supabase = makeSupabase({
      preferences: {
        email_enabled: true,
        daily_digest_enabled: true,
        booking_updates_enabled: true,
        provider_updates_enabled: true,
        email_suppressed_at: "2026-01-01T00:00:00.000Z",
        email_suppressed_reason: "bounce",
        email_suppressed_address: "traveler@example.com",
      },
    });
    const sendEmail = vi.fn();

    await processNotificationMessage(
      supabase,
      {
        notificationId: "notification-1",
      },
      { sendEmail, config: testConfig },
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(supabase.__updates).toContainEqual(
      expect.objectContaining({ status: "skipped" }),
    );
  });

  it("processes queued notification records", async () => {
    const supabase = makeSupabase();
    const sendEmail = vi.fn().mockResolvedValue({
      messageId: "provider-message-1",
      rawResponse: { status: 200 },
    });

    const result = await processQueuedNotificationEmails(supabase, {
      sendEmail,
      config: testConfig,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(result).toEqual({
      processed: 1,
      sent: 1,
      skipped: 0,
      retried: 0,
      failed: 0,
      exhausted: 0,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("claim_notification_events", {
      p_limit: 25,
      p_claim_token: expect.any(String),
      p_notification_id: null,
      p_lease_seconds: 300,
    });
  });

  it("leaves work queued without claiming when delivery is disabled", async () => {
    const supabase = makeSupabase();
    const config: NotificationConfig = {
      ...testConfig,
      deliveryEnabled: false,
    };

    await expect(
      processNotificationMessage(
        supabase,
        { notificationId: "notification-1" },
        { config },
      ),
    ).resolves.toBe("pending");
    await expect(
      processQueuedNotificationEmails(supabase, { config }),
    ).resolves.toEqual({
      processed: 0,
      sent: 0,
      skipped: 0,
      retried: 0,
      failed: 0,
      exhausted: 0,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("skips staging recipients outside the configured allowlist", async () => {
    const supabase = makeSupabase();
    const sendEmail = vi.fn();
    const config: NotificationConfig = {
      ...testConfig,
      appEnv: "staging",
      recipientPolicy: "allowlist",
      recipientAllowlist: new Set(["qa@example.com"]),
    };

    const result = await processNotificationMessage(
      supabase,
      { notificationId: "notification-1" },
      { sendEmail, config },
    );

    expect(result).toBe("skipped");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(supabase.__updates).toContainEqual(
      expect.objectContaining({
        status: "skipped",
        status_reason: "recipient_not_allowlisted",
      }),
    );
  });

  it.each([
    [1, "2026-01-01T00:01:00.000Z"],
    [2, "2026-01-01T00:05:00.000Z"],
    [3, "2026-01-01T00:15:00.000Z"],
    [4, "2026-01-01T01:00:00.000Z"],
  ])(
    "schedules retry attempt %s with the expected backoff",
    async (attemptCount, nextAttemptAt) => {
    const supabase = makeSupabase({ attemptCount });
    const sendEmail = vi.fn().mockRejectedValue(
      new NotificationDeliveryError("Resend email delivery failed with 503", {
        retryable: true,
        statusCode: 503,
      }),
    );

    const result = await processNotificationMessage(
      supabase,
      { notificationId: "notification-1" },
      {
        sendEmail,
        config: testConfig,
        now: new Date("2026-01-01T00:00:00.000Z"),
      },
    );

    expect(result).toBe("retried");
    expect(supabase.__updates).toContainEqual(
      expect.objectContaining({
        status: "pending",
        next_attempt_at: nextAttemptAt,
      }),
    );
    },
  );

  it("marks non-retryable provider failures terminal", async () => {
    const supabase = makeSupabase();
    const sendEmail = vi.fn().mockRejectedValue(
      new NotificationDeliveryError("Resend email delivery failed with 403", {
        retryable: false,
        statusCode: 403,
      }),
    );

    const result = await processNotificationMessage(
      supabase,
      { notificationId: "notification-1" },
      { sendEmail, config: testConfig },
    );

    expect(result).toBe("failed");
    expect(supabase.__updates).toContainEqual(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("exhausts transient delivery after five attempts", async () => {
    const supabase = makeSupabase({ attemptCount: 5 });
    const sendEmail = vi.fn().mockRejectedValue(
      new NotificationDeliveryError("network unavailable", { retryable: true }),
    );

    const result = await processNotificationMessage(
      supabase,
      { notificationId: "notification-1" },
      { sendEmail, config: testConfig },
    );

    expect(result).toBe("exhausted");
    expect(supabase.__updates).toContainEqual(
      expect.objectContaining({ status: "failed" }),
    );
  });
});
