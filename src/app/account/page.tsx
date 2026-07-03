import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountClient } from "./AccountClient";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/auth/login?redirect=/account");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  const { data: notificationPreferences } = await supabase
    .from("notification_preferences")
    .select(
      "email_enabled,daily_digest_enabled,email_suppressed_at,email_suppressed_reason,email_suppressed_address",
    )
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return (
    <AccountClient
      email={userData.user.email ?? null}
      displayName={profile?.display_name ?? null}
      notificationPreferences={{
        email_enabled: notificationPreferences?.email_enabled ?? true,
        daily_digest_enabled:
          notificationPreferences?.daily_digest_enabled ?? false,
        email_suppressed_at:
          notificationPreferences?.email_suppressed_at ?? null,
        email_suppressed_reason:
          notificationPreferences?.email_suppressed_reason ?? null,
        email_suppressed_address:
          notificationPreferences?.email_suppressed_address ?? null,
      }}
    />
  );
}
