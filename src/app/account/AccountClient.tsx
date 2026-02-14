"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  email: string | null;
  displayName: string | null;
};

export function AccountClient({ email, displayName }: Props) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
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
            {displayName ?? "—"}
          </div>
          <div>
            <span className="font-medium text-slate-900">Email:</span>{" "}
            {email ?? "—"}
          </div>
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
