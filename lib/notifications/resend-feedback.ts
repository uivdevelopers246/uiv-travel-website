import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/supabase/types/database";

type ResendFeedbackType = "delivery" | "bounce" | "complaint" | "reject";

type ResendWebhookPayload = {
  type: string;
  data: Record<string, unknown>;
};

type ResendFeedbackResult =
  | { status: "ignored"; reason: "unsupported_event" | "unknown_message" }
  | { status: "processed"; eventType: ResendFeedbackType; suppressed: boolean };

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) {
    throw new Error(`Missing ${name} header`);
  }
  return value;
}

function getWebhookSecret(): string {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("RESEND_WEBHOOK_SECRET environment variable is not set");
  }
  return secret;
}

function getSvixSecretBytes(secret: string): Buffer {
  const value = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(value, "base64");
  } catch {
    return Buffer.from(secret, "utf8");
  }
}

function parseSvixSignatures(header: string): string[] {
  return header
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [version, signature] = part.split(",", 2);
      return version === "v1" ? signature : "";
    })
    .filter(Boolean);
}

function signaturesMatch(expected: string, candidate: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const candidateBytes = Buffer.from(candidate);
  return (
    expectedBytes.length === candidateBytes.length &&
    timingSafeEqual(expectedBytes, candidateBytes)
  );
}

export function verifyResendWebhookSignature(
  rawBody: string,
  headers: Headers,
  now = new Date(),
): void {
  const messageId = requiredHeader(headers, "svix-id");
  const timestamp = requiredHeader(headers, "svix-timestamp");
  const signatureHeader = requiredHeader(headers, "svix-signature");
  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    throw new Error("Invalid svix-timestamp header");
  }

  const ageSeconds = Math.abs(now.getTime() / 1000 - timestampSeconds);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error("Resend webhook timestamp is outside tolerance");
  }

  const signedContent = `${messageId}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", getSvixSecretBytes(getWebhookSecret()))
    .update(signedContent)
    .digest("base64");

  if (
    !parseSvixSignatures(signatureHeader).some((signature) =>
      signaturesMatch(expected, signature),
    )
  ) {
    throw new Error("Invalid Resend webhook signature");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseResendWebhookPayload(value: unknown): ResendWebhookPayload {
  if (!isRecord(value)) {
    throw new Error("Resend webhook payload must be an object");
  }
  if (typeof value.type !== "string" || !isRecord(value.data)) {
    throw new Error("Resend webhook payload is missing type or data");
  }
  return {
    type: value.type,
    data: value.data,
  };
}

function mapResendEventType(type: string): ResendFeedbackType | null {
  switch (type) {
    case "email.sent":
    case "email.delivered":
      return "delivery";
    case "email.bounced":
      return "bounce";
    case "email.complained":
      return "complaint";
    case "email.delivery_delayed":
    case "email.failed":
      return "reject";
    default:
      return null;
  }
}

function getResendEmailId(payload: ResendWebhookPayload): string {
  const value = payload.data.email_id ?? payload.data.id;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Resend webhook payload is missing data.email_id");
  }
  return value;
}

function firstEmailAddress(payload: ResendWebhookPayload): string | null {
  const to = payload.data.to;
  if (Array.isArray(to)) {
    const first = to.find((value): value is string => typeof value === "string");
    if (first) {
      return first;
    }
  }
  const email = payload.data.email;
  return typeof email === "string" && email.trim() ? email : null;
}

async function findNotificationIdByProviderMessageId(
  supabase: SupabaseClient<Database>,
  providerMessageId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("email_delivery_events")
    .select("notification_id")
    .eq("provider_message_id", providerMessageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load delivery event: ${error.message}`);
  }
  return data?.notification_id ?? null;
}

async function loadNotificationUserId(
  supabase: SupabaseClient<Database>,
  notificationId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("notification_events")
    .select("user_id")
    .eq("id", notificationId)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not load notification for feedback: ${error?.message ?? "missing row"}`,
    );
  }
  return data.user_id;
}

async function suppressEmailForNotification(
  supabase: SupabaseClient<Database>,
  input: {
    notificationId: string;
    reason: "bounce" | "complaint";
    address: string | null;
  },
): Promise<void> {
  const userId = await loadNotificationUserId(supabase, input.notificationId);
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        email_suppressed_at: new Date().toISOString(),
        email_suppressed_reason: input.reason,
        email_suppressed_address: input.address,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(`Could not suppress notification email: ${error.message}`);
  }
}

export async function processResendWebhookFeedback(
  supabase: SupabaseClient<Database>,
  payload: ResendWebhookPayload,
): Promise<ResendFeedbackResult> {
  const eventType = mapResendEventType(payload.type);
  if (!eventType) {
    return { status: "ignored", reason: "unsupported_event" };
  }

  const providerMessageId = getResendEmailId(payload);
  const notificationId = await findNotificationIdByProviderMessageId(
    supabase,
    providerMessageId,
  );

  if (!notificationId) {
    return { status: "ignored", reason: "unknown_message" };
  }

  const { error } = await supabase.from("email_delivery_events").insert({
    notification_id: notificationId,
    provider_message_id: providerMessageId,
    event_type: eventType,
    raw_provider_payload: payload as unknown as Json,
  });

  if (error) {
    throw new Error(`Could not store Resend feedback event: ${error.message}`);
  }

  const suppressed = eventType === "bounce" || eventType === "complaint";
  if (suppressed) {
    await suppressEmailForNotification(supabase, {
      notificationId,
      reason: eventType === "complaint" ? "complaint" : "bounce",
      address: firstEmailAddress(payload),
    });
  }

  return { status: "processed", eventType, suppressed };
}
