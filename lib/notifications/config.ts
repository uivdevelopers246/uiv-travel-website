import "server-only";

export type NotificationAppEnv = "local" | "staging" | "production";
export type NotificationTransport = "resend" | "webhook";
export type NotificationRecipientPolicy = "unrestricted" | "allowlist";

export type NotificationConfig = {
  appEnv: NotificationAppEnv;
  deliveryEnabled: boolean;
  transport: NotificationTransport;
  recipientPolicy: NotificationRecipientPolicy;
  recipientAllowlist: ReadonlySet<string>;
};

function trimmed(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function parseAppEnv(): NotificationAppEnv {
  const configured = trimmed("APP_ENV");
  if (configured === "local" || configured === "staging" || configured === "production") {
    return configured;
  }
  if (configured) {
    throw new Error("APP_ENV must be local, staging, or production");
  }

  if (process.env.VERCEL_ENV === "production") {
    return "production";
  }
  if (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "staging"
  ) {
    return "staging";
  }
  return "local";
}

function parseDeliveryEnabled(): boolean {
  const value = trimmed("NOTIFICATION_DELIVERY_ENABLED");
  if (value == null) {
    return true;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error("NOTIFICATION_DELIVERY_ENABLED must be true or false");
}

function parseTransport(): NotificationTransport {
  const configured = trimmed("NOTIFICATION_TRANSPORT");
  if (configured === "resend" || configured === "webhook") {
    return configured;
  }
  if (configured) {
    throw new Error("NOTIFICATION_TRANSPORT must be resend or webhook");
  }

  throw new Error("NOTIFICATION_TRANSPORT is required");
}

function parseRecipientPolicy(
  appEnv: NotificationAppEnv,
): NotificationRecipientPolicy {
  const configured = trimmed("NOTIFICATION_RECIPIENT_POLICY");
  if (configured === "unrestricted" || configured === "allowlist") {
    return configured;
  }
  if (configured) {
    throw new Error(
      "NOTIFICATION_RECIPIENT_POLICY must be unrestricted or allowlist",
    );
  }
  return appEnv === "staging" ? "allowlist" : "unrestricted";
}

function parseAllowlist(): ReadonlySet<string> {
  return new Set(
    (process.env.NOTIFICATION_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function validateTransport(
  transport: NotificationTransport,
  deliveryEnabled: boolean,
): void {
  const resendApiKey = trimmed("RESEND_API_KEY");
  const emailFrom = trimmed("EMAIL_FROM");
  if (Boolean(resendApiKey) !== Boolean(emailFrom)) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM must be configured together");
  }

  const webhookUrl = trimmed("EMAIL_DELIVERY_WEBHOOK_URL");
  const webhookSecret = trimmed("EMAIL_DELIVERY_WEBHOOK_SECRET");
  if (Boolean(webhookUrl) !== Boolean(webhookSecret)) {
    throw new Error(
      "EMAIL_DELIVERY_WEBHOOK_URL and EMAIL_DELIVERY_WEBHOOK_SECRET must be configured together",
    );
  }

  if (!deliveryEnabled) {
    return;
  }

  if (transport === "resend" && (!resendApiKey || !emailFrom)) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required for Resend delivery");
  }
  if (transport === "webhook" && (!webhookUrl || !webhookSecret)) {
    throw new Error(
      "EMAIL_DELIVERY_WEBHOOK_URL and EMAIL_DELIVERY_WEBHOOK_SECRET are required for webhook delivery",
    );
  }
}

export function getNotificationConfig(): NotificationConfig {
  const appEnv = parseAppEnv();
  const deliveryEnabled = parseDeliveryEnabled();
  const transport = parseTransport();
  const recipientPolicy = parseRecipientPolicy(appEnv);
  const recipientAllowlist = parseAllowlist();

  if (
    appEnv === "staging" &&
    (recipientPolicy !== "allowlist" || recipientAllowlist.size === 0)
  ) {
    throw new Error(
      "Staging notification delivery requires a non-empty NOTIFICATION_EMAIL_ALLOWLIST",
    );
  }
  if (recipientPolicy === "allowlist" && recipientAllowlist.size === 0) {
    throw new Error(
      "NOTIFICATION_EMAIL_ALLOWLIST is required when recipient policy is allowlist",
    );
  }

  validateTransport(transport, deliveryEnabled);
  return {
    appEnv,
    deliveryEnabled,
    transport,
    recipientPolicy,
    recipientAllowlist,
  };
}

export function isNotificationRecipientAllowed(
  config: NotificationConfig,
  recipient: string,
): boolean {
  return (
    config.recipientPolicy === "unrestricted" ||
    config.recipientAllowlist.has(recipient.trim().toLowerCase())
  );
}
