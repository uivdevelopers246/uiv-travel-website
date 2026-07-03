import "server-only";

import type { NotificationPublishMessage } from "./types";

type PublishNotificationResult =
  | { published: true }
  | { published: false; reason: "not_configured" };

function getPublishWebhookUrl(): string | null {
  const value = process.env.NOTIFICATION_PUBLISH_WEBHOOK_URL?.trim();
  return value ? value : null;
}

function getPublishWebhookSecret(): string | null {
  const value = process.env.NOTIFICATION_PUBLISH_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}

export async function publishNotificationToWebhook(
  message: NotificationPublishMessage,
): Promise<PublishNotificationResult> {
  const url = getPublishWebhookUrl();
  if (!url) {
    return { published: false, reason: "not_configured" };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const secret = getPublishWebhookSecret();
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Notification publish webhook failed with ${response.status}`);
  }

  return { published: true };
}
