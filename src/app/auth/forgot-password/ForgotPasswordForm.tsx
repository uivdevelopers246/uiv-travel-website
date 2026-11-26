"use client";

import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setPending(true);
    setError(null);
    try {
      const redirectTo = new URL("/auth/confirm", window.location.origin);
      redirectTo.searchParams.set("next", "/auth/reset-password");
      const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: redirectTo.toString() });
      if (error) setError("Unable to request a reset link. Please try again shortly.");
      else setSent(true);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) return <p role="status" className="text-sm leading-6 text-emerald-700">If an account exists for that email, you’ll receive a password reset link. Check your inbox and spam folder, and open the link in this browser.</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm font-medium">Email address
        <input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-[#FBCA1A] px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}
