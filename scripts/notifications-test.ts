import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";

import { getNotificationConfig } from "@/lib/notifications/config";
import { processNotificationMessage } from "@/lib/notifications/email-worker";
import { createNotificationEvent } from "@/lib/notifications/events";
import type {
  NotificationEventType,
  NotificationPayload,
} from "@/lib/notifications/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

loadEnvConfig(process.cwd());

const allowedEvents = new Set<NotificationEventType>([
  "booking_confirmed",
  "booking_declined",
  "booking_expired",
  "payment_completed",
  "payment_failed",
  "order_receipt",
  "provider_booking_pending",
  "daily_digest",
]);

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

async function main() {
  const userId = argument("user-id");
  const to = argument("to");
  const eventValue = argument("event");
  if (!userId || !to || !eventValue || !allowedEvents.has(eventValue as NotificationEventType)) {
    throw new Error(
      "Usage: npm run notifications:test -- --user-id <uuid> --to <email> --event <event-type>",
    );
  }

  const eventType = eventValue as NotificationEventType;
  const config = getNotificationConfig();
  const supabase = createServiceRoleClient();
  const payload = {
    source: "notification-cli",
    category: "manual_test",
    event: eventType,
    occurredAt: new Date().toISOString(),
    recipient: { email: to, displayName: "Notification Test" },
    provider: { name: "Test Provider", email: to },
    order: {
      id: `test-order-${randomUUID()}`,
      status: eventType === "payment_failed" ? "failed" : "paid",
      currency: "usd",
      totalCents: 12500,
    },
    booking: {
      id: `test-booking-${randomUUID()}`,
      activityTitle: "Notification Test Experience",
      accommodationTitle: "Notification Test Stay",
      slotStartsAt: new Date().toISOString(),
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

  const notification = await createNotificationEvent(supabase, {
    userId,
    eventType,
    payload,
    dedupeKey: `manual-test:${config.appEnv}:${eventType}:${randomUUID()}`,
  });
  const result = await processNotificationMessage(supabase, {
    notificationId: notification.id,
  });

  console.log(
    JSON.stringify(
      { notificationId: notification.id, appEnv: config.appEnv, result },
      null,
      2,
    ),
  );
  if (result !== "sent" && result !== "pending" && result !== "retried") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
