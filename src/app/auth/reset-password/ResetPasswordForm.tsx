"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") ?? "");
    setError(null);
    if (password !== values.get("confirmation")) {
      setError("The passwords do not match.");
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      setError("Include uppercase and lowercase letters, a number, and a symbol.");
      return;
    }
    setPending(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) setError(error.message);
      else setSaved(true);
    } catch {
      setError("Unable to update your password. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (saved) return <div role="status" className="space-y-4 text-sm"><p className="text-emerald-700">Your password has been updated.</p><Link href="/account" className="font-semibold text-[#407FC2] hover:underline">Continue to your account</Link></div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm font-medium">New password
        <input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      <label className="block text-sm font-medium">Confirm new password
        <input name="confirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-[#FBCA1A] px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? "Updating…" : "Update password"}</button>
    </form>
  );
}
