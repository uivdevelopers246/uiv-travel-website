import Link from "next/link";
import type { ReactNode } from "react";

export function RecoveryPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-white via-[#f0f6fc] to-[#dce9f5] px-4 py-12 text-[#193059]">
      <Link href="/" className="mb-8 font-semibold text-[#407FC2] hover:underline">LocalPin · Home</Link>
      <div className="w-full max-w-md rounded-2xl border border-[#407FC2]/15 bg-white p-6 shadow-xl sm:p-8">
        <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-playfair)" }}>{title}</h1>
        <p className="mb-6 mt-2 text-sm text-slate-600">{description}</p>
        {children}
        <Link href="/auth/login" className="mt-6 block text-center text-sm font-semibold text-[#407FC2] hover:underline">Back to sign in</Link>
      </div>
    </main>
  );
}
