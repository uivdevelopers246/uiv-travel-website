import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";
import {
  parseResendWebhookPayload,
  processResendWebhookFeedback,
  verifyResendWebhookSignature,
} from "./resend-feedback";

const secretBytes = Buffer.from("test-webhook-secret");
const webhookSecret = `whsec_${secretBytes.toString("base64")}`;

function signedHeaders(rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
  const id = "msg_123";
  const signature = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": `v1,${signature}`,
  });
}

function makeSupabase() {
  const inserts: unknown[] = [];
  const upserts: unknown[] = [];
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "email_delivery_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { notification_id: "notification-1" },
            error: null,
          }),
          insert: vi.fn((value) => {
            inserts.push(value);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "notification_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { user_id: "user-1" },
            error: null,
          }),
        };
      }
      if (table === "notification_preferences") {
        return {
          upsert: vi.fn((value) => {
            upserts.push(value);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    __inserts: inserts,
    __upserts: upserts,
  };
  return supabase as unknown as SupabaseClient<Database> & {
    __inserts: unknown[];
    __upserts: unknown[];
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_WEBHOOK_SECRET", webhookSecret);
});

describe("resend feedback", () => {
  it("verifies signed Resend webhook requests", () => {
    const rawBody = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "resend-email-1" },
    });

    expect(() =>
      verifyResendWebhookSignature(rawBody, signedHeaders(rawBody)),
    ).not.toThrow();
    expect(() =>
      verifyResendWebhookSignature(rawBody, signedHeaders(`${rawBody}x`)),
    ).toThrow("Invalid Resend webhook signature");
  });

  it("stores delivery lifecycle events", async () => {
    const supabase = makeSupabase();
    const payload = parseResendWebhookPayload({
      type: "email.delivered",
      data: { email_id: "resend-email-1", to: ["traveler@example.com"] },
    });

    const result = await processResendWebhookFeedback(supabase, payload);

    expect(result).toEqual({
      status: "processed",
      eventType: "delivery",
      suppressed: false,
    });
    expect(supabase.__inserts).toEqual([
      expect.objectContaining({
        notification_id: "notification-1",
        provider_message_id: "resend-email-1",
        event_type: "delivery",
      }),
    ]);
    expect(supabase.__upserts).toEqual([]);
  });

  it("suppresses future email on bounce or complaint", async () => {
    const supabase = makeSupabase();
    const payload = parseResendWebhookPayload({
      type: "email.bounced",
      data: { email_id: "resend-email-1", to: ["traveler@example.com"] },
    });

    const result = await processResendWebhookFeedback(supabase, payload);

    expect(result).toEqual({
      status: "processed",
      eventType: "bounce",
      suppressed: true,
    });
    expect(supabase.__upserts).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        email_suppressed_reason: "bounce",
        email_suppressed_address: "traveler@example.com",
      }),
    ]);
  });
});
