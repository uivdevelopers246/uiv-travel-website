import { loadEnvConfig } from "@next/env";

import { getNotificationConfig } from "@/lib/notifications/config";
import { renderNotificationEmail } from "@/lib/notifications/email-worker";
import type {
  NotificationEventType,
  NotificationPayload,
} from "@/lib/notifications/types";

loadEnvConfig(process.cwd());

const eventTypes: NotificationEventType[] = [
  "booking_confirmed",
  "booking_declined",
  "booking_expired",
  "payment_completed",
  "payment_failed",
  "order_receipt",
  "provider_booking_pending",
  "daily_digest",
];

const fixture = {
  recipient: { email: "notification-check@example.com", displayName: "Test User" },
  provider: { name: "Test Provider", email: "provider@example.com" },
  order: { id: "order-check", status: "paid", currency: "usd", totalCents: 12500 },
  booking: {
    id: "booking-check",
    activityTitle: "Notification Test Experience",
    accommodationTitle: "Notification Test Stay",
    slotStartsAt: "2026-08-04T15:00:00.000Z",
    participants: 2,
    guests: 2,
  },
  summary: {
    newBookings: 1,
    pendingApprovals: 1,
    expiringApprovals: 0,
    confirmedBookings: 1,
    declinedBookings: 0,
    failedPayments: 0,
  },
} satisfies NotificationPayload;

async function main() {
  const config = getNotificationConfig();
  const required = ["RESEND_WEBHOOK_SECRET", "CRON_SECRET"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required notification variables: ${missing.join(", ")}`);
  }

  for (const eventType of eventTypes) {
    await renderNotificationEmail(eventType, fixture);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        appEnv: config.appEnv,
        deliveryEnabled: config.deliveryEnabled,
        transport: config.transport,
        recipientPolicy: config.recipientPolicy,
        allowlistSize: config.recipientAllowlist.size,
        templatesRendered: eventTypes.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
