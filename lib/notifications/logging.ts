import type { NotificationEventType } from "./types";

type NotificationLog = {
  appEnv: string;
  notificationId: string;
  eventType: NotificationEventType;
  attempt: number;
  outcome: string;
  providerMessageId?: string;
};

export function logNotificationOutcome(value: NotificationLog): void {
  console.info(JSON.stringify({ scope: "notification", ...value }));
}
