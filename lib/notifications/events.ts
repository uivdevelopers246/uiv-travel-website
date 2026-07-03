import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";
import type {
  NotificationChannel,
  NotificationEventType,
  NotificationPayload,
  NotificationStatus,
} from "./types";

export type NotificationEventRow =
  Database["public"]["Tables"]["notification_events"]["Row"];

type CreateNotificationEventInput = {
  userId: string;
  eventType: NotificationEventType;
  payload: NotificationPayload;
  dedupeKey: string;
  channel?: NotificationChannel;
};

function isDuplicateInsertError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function getNotificationByDedupeKey(
  supabase: SupabaseClient<Database>,
  input: Required<Pick<CreateNotificationEventInput, "channel" | "eventType" | "dedupeKey">>,
): Promise<NotificationEventRow | null> {
  const { data, error } = await supabase
    .from("notification_events")
    .select("*")
    .eq("channel", input.channel)
    .eq("event_type", input.eventType)
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load notification event: ${error.message}`);
  }
  return data;
}

export async function createNotificationEvent(
  supabase: SupabaseClient<Database>,
  input: CreateNotificationEventInput,
): Promise<NotificationEventRow> {
  const channel = input.channel ?? "email";
  const { data, error } = await supabase
    .from("notification_events")
    .insert({
      user_id: input.userId,
      channel,
      event_type: input.eventType,
      payload: input.payload,
      dedupe_key: input.dedupeKey,
      status: "pending",
    })
    .select("*")
    .single();

  if (!error && data) {
    return data;
  }

  if (isDuplicateInsertError(error)) {
    const existing = await getNotificationByDedupeKey(supabase, {
      channel,
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
    });
    if (existing) {
      return existing;
    }
  }

  throw new Error(
    `Could not create notification event: ${
      error?.message ?? "missing inserted row"
    }`,
  );
}

export async function updateNotificationEventStatus(
  supabase: SupabaseClient<Database>,
  notificationId: string,
  status: NotificationStatus,
): Promise<void> {
  const { error } = await supabase
    .from("notification_events")
    .update({ status })
    .eq("id", notificationId);

  if (error) {
    throw new Error(`Could not update notification event: ${error.message}`);
  }
}
