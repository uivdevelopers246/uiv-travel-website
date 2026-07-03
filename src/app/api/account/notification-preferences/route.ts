import { NextResponse } from "next/server";

import {
  badRequest,
  parseJsonBody,
  requireSameOriginPost,
  serverError,
  unauthorized,
} from "@/api-shared/route-helpers";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/supabase/types/database";

type NotificationPreferences =
  Database["public"]["Tables"]["notification_preferences"]["Row"];

function publicPreferences(row: NotificationPreferences) {
  return {
    email_enabled: row.email_enabled,
    daily_digest_enabled: row.daily_digest_enabled,
    email_suppressed_at: row.email_suppressed_at,
    email_suppressed_reason: row.email_suppressed_reason,
    email_suppressed_address: row.email_suppressed_address,
  };
}

async function getUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { supabase, response: unauthorized() };
  }
  return { supabase, userId: data.user.id };
}

async function upsertDefaultPreferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<NotificationPreferences> {
  const { data: existing, error: selectError } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Could not load notification preferences: ${selectError.message}`,
    );
  }
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not load notification preferences: ${error.message}`);
  }
  return data;
}

export async function GET() {
  const auth = await getUserId();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const preferences = await upsertDefaultPreferences(auth.supabase, auth.userId);
    return NextResponse.json(publicPreferences(preferences), { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong. Please try again.";
    return serverError(message);
  }
}

export async function PATCH(req: Request) {
  const sameOriginError = requireSameOriginPost(req);
  if (sameOriginError) {
    return sameOriginError;
  }

  const parsed = await parseJsonBody(req);
  if ("response" in parsed) {
    return parsed.response;
  }

  const emailEnabled = parsed.body.email_enabled;
  const dailyDigestEnabled = parsed.body.daily_digest_enabled;
  if (
    typeof emailEnabled !== "boolean" ||
    typeof dailyDigestEnabled !== "boolean"
  ) {
    return badRequest(
      "email_enabled and daily_digest_enabled must be boolean values.",
    );
  }

  const auth = await getUserId();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { data, error } = await auth.supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: auth.userId,
          email_enabled: emailEnabled,
          daily_digest_enabled: dailyDigestEnabled,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new Error(`Could not update notification preferences: ${error.message}`);
    }

    return NextResponse.json(publicPreferences(data), { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong. Please try again.";
    return serverError(message);
  }
}
