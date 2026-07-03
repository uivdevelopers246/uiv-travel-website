import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";
import {
  processNotificationMessage,
  processQueuedNotificationEmails,
  renderNotificationEmail,
} from "./email-worker";

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
};

function makeSupabase(overrides: {
  notificationStatus?: string;
  eventType?: string;
  preferences?: Record<string, boolean | string | null> | null;
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
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
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
      { sendEmail },
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "traveler@example.com",
        idempotencyKey: "booking:booking-1:booking_confirmed",
        subject: expect.stringContaining("Sunset Cruise"),
      }),
    );
    expect(supabase.__inserts).toEqual([
      expect.objectContaining({
        notification_id: "notification-1",
        provider_message_id: "provider-message-1",
        event_type: "send",
      }),
    ]);
    expect(supabase.__updates).toContainEqual({ status: "sent" });
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
      { sendEmail },
    );

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(supabase.__updates).toContainEqual({ status: "sent" });
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
      { sendEmail },
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(supabase.__updates).toContainEqual({ status: "skipped" });
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
      { sendEmail },
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(supabase.__updates).toContainEqual({ status: "skipped" });
  });

  it("processes queued notification records", async () => {
    const supabase = makeSupabase();
    const sendEmail = vi.fn().mockResolvedValue({
      messageId: "provider-message-1",
      rawResponse: { status: 200 },
    });

    const result = await processQueuedNotificationEmails(supabase, {
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(result).toEqual({
      processed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
  });
});
