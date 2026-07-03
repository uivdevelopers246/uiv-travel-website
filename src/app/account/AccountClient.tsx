"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NotificationPreferences = {
  email_enabled: boolean;
  daily_digest_enabled: boolean;
  email_suppressed_at: string | null;
  email_suppressed_reason: string | null;
  email_suppressed_address: string | null;
};

type Props = {
  email: string | null;
  displayName: string | null;
  notificationPreferences: NotificationPreferences;
};

export function AccountClient({
  email,
  displayName,
  notificationPreferences,
}: Props) {
  const router = useRouter();
  const [preferences, setPreferences] = useState(notificationPreferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  const updatePreferences = async (
    updates: Pick<NotificationPreferences, "email_enabled" | "daily_digest_enabled">,
  ) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/notification-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Could not update notification settings");
      }
      setPreferences(body);
      setMessage("Notification settings saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update notification settings",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold">Account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Manage your profile and sign out.
        </p>

        <div className="mt-6 space-y-2 text-sm text-slate-700">
          <div>
            <span className="font-medium text-slate-900">Name:</span>{" "}
            {displayName ?? "-"}
          </div>
          <div>
            <span className="font-medium text-slate-900">Email:</span>{" "}
            {email ?? "-"}
          </div>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-8">
          <h2 className="text-xl font-semibold text-slate-950">
            Notification settings
          </h2>
          <div className="mt-4 space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-slate-950">
                  Optional account emails
                </span>
                <span className="block text-sm text-slate-600">
                  Allows non-transactional account email. Receipts and booking
                  status emails still send.
                </span>
              </span>
              <input
                type="checkbox"
                checked={preferences.email_enabled}
                disabled={saving}
                onChange={(event) =>
                  updatePreferences({
                    email_enabled: event.target.checked,
                    daily_digest_enabled: preferences.daily_digest_enabled,
                  })
                }
                className="h-5 w-5 accent-[#193059]"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-slate-950">
                  Provider daily digest
                </span>
                <span className="block text-sm text-slate-600">
                  Sends a daily provider summary for pending approvals and
                  recent booking activity.
                </span>
              </span>
              <input
                type="checkbox"
                checked={preferences.daily_digest_enabled}
                disabled={saving || !preferences.email_enabled}
                onChange={(event) =>
                  updatePreferences({
                    email_enabled: preferences.email_enabled,
                    daily_digest_enabled: event.target.checked,
                  })
                }
                className="h-5 w-5 accent-[#193059]"
              />
            </label>
          </div>

          {preferences.email_suppressed_at ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Email delivery is paused for{" "}
              {preferences.email_suppressed_address ?? "this address"} because
              of a {preferences.email_suppressed_reason ?? "delivery"} event.
            </p>
          ) : null}

          {message ? (
            <p className="mt-4 text-sm text-slate-600">{message}</p>
          ) : null}
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full bg-[#193059] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#407FC2]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
