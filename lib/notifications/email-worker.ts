import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Handlebars from "handlebars";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/supabase/types/database";
import type { NotificationEventType, NotificationPayload } from "./types";
import { isResendEmailConfigured, sendEmailWithResend } from "./resend";

type NotificationEventRow =
  Database["public"]["Tables"]["notification_events"]["Row"];
type NotificationPreferenceRow =
  Database["public"]["Tables"]["notification_preferences"]["Row"];
type WorkerPreferences = Pick<
  NotificationPreferenceRow,
  | "email_enabled"
  | "daily_digest_enabled"
  | "booking_updates_enabled"
  | "provider_updates_enabled"
  | "email_suppressed_at"
  | "email_suppressed_reason"
  | "email_suppressed_address"
>;

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type EmailSendInput = RenderedEmail & {
  to: string;
  idempotencyKey?: string;
};

export type EmailSendResult = {
  messageId: string;
  rawResponse?: Json;
};

type ProcessNotificationOptions = {
  templateDir?: string;
  sendEmail?: (input: EmailSendInput) => Promise<EmailSendResult>;
};

type ProcessBatchOptions = ProcessNotificationOptions & {
  limit?: number;
};

type ProcessBatchResult = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};

const templateNames: Record<NotificationEventType, string> = {
  booking_confirmed: "booking-confirmed",
  booking_declined: "booking-declined",
  booking_expired: "booking-expired",
  payment_completed: "order-receipt",
  payment_failed: "payment-failed",
  order_receipt: "order-receipt",
  provider_booking_pending: "provider-booking-pending",
  daily_digest: "daily-digest",
};

const defaultPreferences: WorkerPreferences = {
  email_enabled: true,
  daily_digest_enabled: false,
  booking_updates_enabled: true,
  provider_updates_enabled: true,
  email_suppressed_at: null,
  email_suppressed_reason: null,
  email_suppressed_address: null,
};

const transactionalEventTypes = new Set<NotificationEventType>([
  "booking_confirmed",
  "booking_declined",
  "booking_expired",
  "payment_completed",
  "payment_failed",
  "order_receipt",
  "provider_booking_pending",
]);

Handlebars.registerHelper(
  "formatCurrency",
  (amountCents?: number, currency?: string) => {
    if (typeof amountCents !== "number") {
      return "";
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amountCents / 100);
  },
);

Handlebars.registerHelper("formatDateTime", (value?: string) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Barbados",
  }).format(date);
});

function getTemplateDir(override?: string): string {
  return (
    override ??
    process.env.EMAIL_TEMPLATE_DIR ??
    path.join(process.cwd(), "emails", "templates")
  );
}

function getEmailDeliveryWebhookUrl(): string {
  const value = process.env.EMAIL_DELIVERY_WEBHOOK_URL?.trim();
  if (!value) {
    throw new Error("EMAIL_DELIVERY_WEBHOOK_URL is required");
  }
  return value;
}

function getEmailDeliveryWebhookSecret(): string | null {
  return process.env.EMAIL_DELIVERY_WEBHOOK_SECRET?.trim() || null;
}

function hasEmailDeliveryWebhookConfigured(): boolean {
  return Boolean(process.env.EMAIL_DELIVERY_WEBHOOK_URL?.trim());
}

function asRecord(value: NotificationPayload): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function nestedString(
  value: Record<string, unknown>,
  pathParts: string[],
): string | null {
  let current: unknown = value;
  for (const part of pathParts) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    ) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function getRecipientEmail(payload: NotificationPayload): string | null {
  const record = asRecord(payload);
  return (
    nestedString(record, ["recipient", "email"]) ??
    nestedString(record, ["provider", "email"]) ??
    nestedString(record, ["email"])
  );
}

function getRecipientName(payload: NotificationPayload): string {
  const record = asRecord(payload);
  return (
    nestedString(record, ["recipient", "displayName"]) ??
    nestedString(record, ["recipient", "name"]) ??
    nestedString(record, ["provider", "displayName"]) ??
    nestedString(record, ["provider", "name"]) ??
    "there"
  );
}

function getSubject(
  eventType: NotificationEventType,
  payload: NotificationPayload,
): string {
  const record = asRecord(payload);
  const activityTitle = nestedString(record, ["booking", "activityTitle"]);
  switch (eventType) {
    case "booking_confirmed":
      return activityTitle
        ? `Booking confirmed: ${activityTitle}`
        : "Your booking is confirmed";
    case "booking_declined":
      return activityTitle
        ? `Booking declined: ${activityTitle}`
        : "Your booking was declined";
    case "booking_expired":
      return activityTitle
        ? `Booking expired: ${activityTitle}`
        : "Your booking request expired";
    case "payment_failed":
      return "Payment failed for your booking";
    case "provider_booking_pending":
      return activityTitle
        ? `New booking pending: ${activityTitle}`
        : "New booking pending approval";
    case "daily_digest":
      return "Your United IV daily digest";
    case "payment_completed":
    case "order_receipt":
      return "Your United IV receipt";
  }
}

function getPreferenceDecision(
  eventType: NotificationEventType,
  preferences: WorkerPreferences,
): { allowed: true } | { allowed: false; reason: string } {
  if (preferences.email_suppressed_at) {
    return {
      allowed: false,
      reason: preferences.email_suppressed_reason
        ? `suppressed_${preferences.email_suppressed_reason}`
        : "suppressed",
    };
  }
  if (transactionalEventTypes.has(eventType)) {
    return { allowed: true };
  }
  if (!preferences.email_enabled) {
    return { allowed: false, reason: "email_disabled" };
  }
  if (eventType === "daily_digest" && !preferences.daily_digest_enabled) {
    return { allowed: false, reason: "daily_digest_disabled" };
  }
  return { allowed: true };
}

async function loadNotificationEvent(
  supabase: SupabaseClient<Database>,
  notificationId: string,
): Promise<NotificationEventRow> {
  const { data, error } = await supabase
    .from("notification_events")
    .select("*")
    .eq("id", notificationId)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not load notification event ${notificationId}: ${
        error?.message ?? "missing row"
      }`,
    );
  }
  return data;
}

async function loadPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<WorkerPreferences> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select(
      "email_enabled,daily_digest_enabled,booking_updates_enabled,provider_updates_enabled,email_suppressed_at,email_suppressed_reason,email_suppressed_address",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load notification preferences: ${error.message}`);
  }
  return data ? { ...defaultPreferences, ...data } : defaultPreferences;
}

async function updateNotificationStatus(
  supabase: SupabaseClient<Database>,
  notificationId: string,
  status: "sent" | "skipped" | "failed",
): Promise<void> {
  const { error } = await supabase
    .from("notification_events")
    .update({ status })
    .eq("id", notificationId);

  if (error) {
    throw new Error(`Could not update notification status: ${error.message}`);
  }
}

async function storeDeliveryEvent(
  supabase: SupabaseClient<Database>,
  input: {
    notificationId: string;
    messageId: string;
    rawProviderPayload: Json;
  },
): Promise<void> {
  const { error } = await supabase.from("email_delivery_events").insert({
    notification_id: input.notificationId,
    provider_message_id: input.messageId,
    event_type: "send",
    raw_provider_payload: input.rawProviderPayload,
  });

  if (error) {
    throw new Error(`Could not store delivery event: ${error.message}`);
  }
}

async function compileTemplateFile(
  templateDir: string,
  fileName: string,
  data: Record<string, unknown>,
): Promise<string> {
  const source = await readFile(path.join(templateDir, fileName), "utf8");
  return Handlebars.compile(source, { noEscape: false })(data);
}

export async function renderNotificationEmail(
  eventType: NotificationEventType,
  payload: NotificationPayload,
  options: { templateDir?: string } = {},
): Promise<RenderedEmail> {
  const templateName = templateNames[eventType];
  const templateDir = getTemplateDir(options.templateDir);
  const data = {
    ...asRecord(payload),
    recipientName: getRecipientName(payload),
    subject: getSubject(eventType, payload),
  };
  const [mjml, text] = await Promise.all([
    compileTemplateFile(templateDir, `${templateName}.mjml`, data),
    compileTemplateFile(templateDir, `${templateName}.txt`, data),
  ]);
  const { default: mjml2html } = await import("mjml");
  const result = mjml2html(mjml, { validationLevel: "soft" });

  if (result.errors.length > 0) {
    throw new Error(
      `MJML template ${templateName} failed validation: ${result.errors[0].message}`,
    );
  }

  return {
    subject: data.subject,
    html: result.html,
    text,
  };
}

function parseWebhookResponse(value: unknown): EmailSendResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      messageId: `email-${randomUUID()}`,
      rawResponse: value === undefined ? {} : (value as Json),
    };
  }

  const body = value as Record<string, unknown>;
  const messageId =
    typeof body.messageId === "string" && body.messageId.trim()
      ? body.messageId
      : typeof body.id === "string" && body.id.trim()
        ? body.id
        : `email-${randomUUID()}`;

  return {
    messageId,
    rawResponse: body as Json,
  };
}

export async function sendEmailWithDeliveryWebhook(
  input: EmailSendInput,
): Promise<EmailSendResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const secret = getEmailDeliveryWebhookSecret();
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  const response = await fetch(getEmailDeliveryWebhookUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Email delivery webhook failed with ${response.status}: ${text}`);
  }

  if (!text.trim()) {
    return {
      messageId: `email-${randomUUID()}`,
      rawResponse: {
        status: response.status,
      },
    };
  }

  try {
    return parseWebhookResponse(JSON.parse(text));
  } catch {
    return {
      messageId: `email-${randomUUID()}`,
      rawResponse: {
        status: response.status,
        body: text,
      },
    };
  }
}

async function sendEmailWithConfiguredTransport(
  input: EmailSendInput,
): Promise<EmailSendResult> {
  if (isResendEmailConfigured()) {
    return sendEmailWithResend(input);
  }
  if (hasEmailDeliveryWebhookConfigured()) {
    return sendEmailWithDeliveryWebhook(input);
  }
  throw new Error("Resend email delivery is not configured");
}

export async function processNotificationMessage(
  supabase: SupabaseClient<Database>,
  message: { notificationId: string },
  options: ProcessNotificationOptions = {},
): Promise<"sent" | "skipped"> {
  const notification = await loadNotificationEvent(
    supabase,
    message.notificationId,
  );

  if (notification.status === "sent" || notification.status === "skipped") {
    return notification.status;
  }

  try {
    const eventType = notification.event_type as NotificationEventType;
    const preferences = await loadPreferences(supabase, notification.user_id);
    const decision = getPreferenceDecision(eventType, preferences);
    if (!decision.allowed) {
      await updateNotificationStatus(supabase, notification.id, "skipped");
      return "skipped";
    }

    const to = getRecipientEmail(notification.payload);
    if (!to) {
      throw new Error("Notification payload does not include a recipient email");
    }

    const rendered = await renderNotificationEmail(
      eventType,
      notification.payload,
      { templateDir: options.templateDir },
    );
    const result = await (options.sendEmail ?? sendEmailWithConfiguredTransport)({
      to,
      idempotencyKey: notification.dedupe_key ?? notification.id,
      ...rendered,
    });

    await storeDeliveryEvent(supabase, {
      notificationId: notification.id,
      messageId: result.messageId,
      rawProviderPayload: result.rawResponse ?? { messageId: result.messageId },
    });
    await updateNotificationStatus(supabase, notification.id, "sent");
    return "sent";
  } catch (error) {
    await updateNotificationStatus(supabase, notification.id, "failed");
    throw error;
  }
}

async function loadProcessableNotificationIds(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("notification_events")
    .select("id")
    .eq("channel", "email")
    .in("status", ["pending", "published"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load queued notifications: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id);
}

export async function processQueuedNotificationEmails(
  supabase: SupabaseClient<Database>,
  options: ProcessBatchOptions = {},
): Promise<ProcessBatchResult> {
  const limit = options.limit ?? 25;
  const notificationIds = await loadProcessableNotificationIds(supabase, limit);
  const result: ProcessBatchResult = {
    processed: notificationIds.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const notificationId of notificationIds) {
    try {
      const status = await processNotificationMessage(
        supabase,
        { notificationId },
        options,
      );
      result[status] += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
