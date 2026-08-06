import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Handlebars from "handlebars";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/supabase/types/database";
import {
  getNotificationConfig,
  isNotificationRecipientAllowed,
  type NotificationConfig,
} from "./config";
import {
  isRetryableNotificationError,
  NotificationDeliveryError,
} from "./delivery-error";
import { logNotificationOutcome } from "./logging";
import type { NotificationEventType, NotificationPayload } from "./types";
import { sendEmailWithResend } from "./resend";

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
  config?: NotificationConfig;
  now?: Date;
};

type ProcessBatchOptions = ProcessNotificationOptions & {
  limit?: number;
};

type ProcessBatchResult = {
  processed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  exhausted: number;
};

type ProcessNotificationResult =
  | "sent"
  | "skipped"
  | "pending"
  | "retried"
  | "failed"
  | "exhausted";

const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60] as const;
const CLAIM_LEASE_SECONDS = 5 * 60;

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
  const accommodationTitle = nestedString(record, ["booking", "accommodationTitle"]);
  const bookingTitle = activityTitle ?? accommodationTitle;
  switch (eventType) {
    case "booking_confirmed":
      return bookingTitle
        ? `Booking confirmed: ${bookingTitle}`
        : "Your booking is confirmed";
    case "booking_declined":
      return bookingTitle
        ? `Booking declined: ${bookingTitle}`
        : "Your booking was declined";
    case "booking_expired":
      return bookingTitle
        ? `Booking expired: ${bookingTitle}`
        : "Your booking request expired";
    case "payment_failed":
      return "Payment failed for your booking";
    case "provider_booking_pending":
      return bookingTitle
        ? `New booking pending: ${bookingTitle}`
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

async function updateClaimedNotification(
  supabase: SupabaseClient<Database>,
  notification: NotificationEventRow,
  update: Database["public"]["Tables"]["notification_events"]["Update"],
): Promise<void> {
  let query = supabase
    .from("notification_events")
    .update(update)
    .eq("id", notification.id)
    .eq("status", "processing");

  if (notification.claim_token) {
    query = query.eq("claim_token", notification.claim_token);
  }

  const { data, error } = await query.select("id");

  if (error) {
    throw new Error(`Could not update notification status: ${error.message}`);
  }
  if (data?.length !== 1) {
    throw new Error(
      "Could not update notification status because the delivery claim was lost",
    );
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

  let response: Response;
  try {
    response = await fetch(getEmailDeliveryWebhookUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new NotificationDeliveryError("Email delivery webhook request failed", {
      retryable: true,
      cause: error,
    });
  }
  const text = await response.text();

  if (!response.ok) {
    throw new NotificationDeliveryError(
      `Email delivery webhook failed with ${response.status}: ${text}`,
      {
        retryable: response.status === 429 || response.status >= 500,
        statusCode: response.status,
      },
    );
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
  config: NotificationConfig,
): Promise<EmailSendResult> {
  if (config.transport === "resend") {
    return sendEmailWithResend(input);
  }
  if (config.transport === "webhook" && hasEmailDeliveryWebhookConfigured()) {
    return sendEmailWithDeliveryWebhook(input);
  }
  throw new Error(`Notification transport ${config.transport} is not configured`);
}

async function claimNotificationEvents(
  supabase: SupabaseClient<Database>,
  input: { limit: number; notificationId?: string },
): Promise<NotificationEventRow[]> {
  const claimToken = randomUUID();
  const { data, error } = await supabase.rpc("claim_notification_events", {
    p_limit: input.limit,
    p_claim_token: claimToken,
    p_notification_id: input.notificationId ?? null,
    p_lease_seconds: CLAIM_LEASE_SECONDS,
  });

  if (error) {
    throw new NotificationDeliveryError(
      `Could not claim notification events: ${error.message}`,
      { retryable: true },
    );
  }
  return data ?? [];
}

function retryDelayMinutes(attemptCount: number): number {
  return (
    RETRY_BACKOFF_MINUTES[
      Math.min(Math.max(attemptCount - 1, 0), RETRY_BACKOFF_MINUTES.length - 1)
    ] ?? RETRY_BACKOFF_MINUTES[RETRY_BACKOFF_MINUTES.length - 1]
  );
}

function isRetryableProcessingError(error: unknown): boolean {
  if (isRetryableNotificationError(error)) {
    return true;
  }
  return (
    error instanceof Error &&
    /^(Could not (load|store|update)|Notification delivery database)/.test(
      error.message,
    )
  );
}

async function processClaimedNotification(
  supabase: SupabaseClient<Database>,
  notification: NotificationEventRow,
  options: ProcessNotificationOptions,
): Promise<ProcessNotificationResult> {
  const config = options.config ?? getNotificationConfig();
  const eventType = notification.event_type as NotificationEventType;
  const attempt = notification.attempt_count;

  try {
    const preferences = await loadPreferences(supabase, notification.user_id);
    const decision = getPreferenceDecision(eventType, preferences);
    if (!decision.allowed) {
      await updateClaimedNotification(supabase, notification, {
        status: "skipped",
        status_reason: decision.reason,
        claim_token: null,
        claimed_at: null,
      });
      logNotificationOutcome({
        appEnv: config.appEnv,
        notificationId: notification.id,
        eventType,
        attempt,
        outcome: "skipped",
      });
      return "skipped";
    }

    const to = getRecipientEmail(notification.payload);
    if (!to) {
      throw new Error("Notification payload does not include a recipient email");
    }
    if (!isNotificationRecipientAllowed(config, to)) {
      await updateClaimedNotification(supabase, notification, {
        status: "skipped",
        status_reason: "recipient_not_allowlisted",
        claim_token: null,
        claimed_at: null,
      });
      logNotificationOutcome({
        appEnv: config.appEnv,
        notificationId: notification.id,
        eventType,
        attempt,
        outcome: "recipient_not_allowlisted",
      });
      return "skipped";
    }

    const rendered = await renderNotificationEmail(eventType, notification.payload, {
      templateDir: options.templateDir,
    });
    const result = await (
      options.sendEmail ??
      ((email) => sendEmailWithConfiguredTransport(email, config))
    )({
      to,
      idempotencyKey: notification.dedupe_key ?? notification.id,
      ...rendered,
    });

    await storeDeliveryEvent(supabase, {
      notificationId: notification.id,
      messageId: result.messageId,
      rawProviderPayload: result.rawResponse ?? { messageId: result.messageId },
    });
    await updateClaimedNotification(supabase, notification, {
      status: "sent",
      status_reason: null,
      claim_token: null,
      claimed_at: null,
    });
    logNotificationOutcome({
      appEnv: config.appEnv,
      notificationId: notification.id,
      eventType,
      attempt,
      outcome: "sent",
      providerMessageId: result.messageId,
    });
    return "sent";
  } catch (error) {
    const retryable = isRetryableProcessingError(error);
    const exhausted = retryable && attempt >= MAX_DELIVERY_ATTEMPTS;
    const statusReason =
      error instanceof Error ? error.message.slice(0, 1000) : "Unknown delivery error";

    if (retryable && !exhausted) {
      const now = options.now ?? new Date();
      const nextAttemptAt = new Date(
        now.getTime() + retryDelayMinutes(attempt) * 60 * 1000,
      ).toISOString();
      await updateClaimedNotification(supabase, notification, {
        status: "pending",
        status_reason: statusReason,
        next_attempt_at: nextAttemptAt,
        claim_token: null,
        claimed_at: null,
      });
      logNotificationOutcome({
        appEnv: config.appEnv,
        notificationId: notification.id,
        eventType,
        attempt,
        outcome: "retry_scheduled",
      });
      return "retried";
    }

    await updateClaimedNotification(supabase, notification, {
      status: "failed",
      status_reason: statusReason,
      claim_token: null,
      claimed_at: null,
    });
    logNotificationOutcome({
      appEnv: config.appEnv,
      notificationId: notification.id,
      eventType,
      attempt,
      outcome: exhausted ? "retry_exhausted" : "failed",
    });
    return exhausted ? "exhausted" : "failed";
  }
}

export async function processNotificationMessage(
  supabase: SupabaseClient<Database>,
  message: { notificationId: string },
  options: ProcessNotificationOptions = {},
): Promise<ProcessNotificationResult> {
  const config = options.config ?? getNotificationConfig();
  if (!config.deliveryEnabled) {
    return "pending";
  }

  const existing = await loadNotificationEvent(supabase, message.notificationId);
  if (existing.status === "sent" || existing.status === "skipped") {
    return existing.status;
  }
  if (existing.status === "failed") {
    return "failed";
  }
  const [claimed] = await claimNotificationEvents(supabase, {
    limit: 1,
    notificationId: message.notificationId,
  });
  if (!claimed) {
    return "pending";
  }
  return processClaimedNotification(supabase, claimed, { ...options, config });
}

export async function processQueuedNotificationEmails(
  supabase: SupabaseClient<Database>,
  options: ProcessBatchOptions = {},
): Promise<ProcessBatchResult> {
  const config = options.config ?? getNotificationConfig();
  const limit = options.limit ?? 25;
  if (!config.deliveryEnabled) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      retried: 0,
      failed: 0,
      exhausted: 0,
    };
  }
  const notifications = await claimNotificationEvents(supabase, { limit });
  const result: ProcessBatchResult = {
    processed: notifications.length,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    exhausted: 0,
  };

  for (const notification of notifications) {
    try {
      const status = await processClaimedNotification(
        supabase,
        notification,
        { ...options, config },
      );
      if (status !== "pending") {
        result[status] += 1;
      }
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
