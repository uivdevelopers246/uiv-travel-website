"use client";

import Link from "next/link";

export function SettingsFab() {
  return (
    <div className="group fixed right-8 top-[92px] z-[60] pb-3">
      <button
        type="button"
        aria-label="Admin settings"
        title="Admin settings"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-[#193059] shadow-lg ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:text-[#407FC2] hover:shadow-xl"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .3 1.7 1.7 0 0 0-.85 1.46V21a2 2 0 1 1-4 0v-.07a1.7 1.7 0 0 0-.85-1.46 1.7 1.7 0 0 0-1-.3 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.3-1 1.7 1.7 0 0 0-1.46-.85H2.8a2 2 0 1 1 0-4h.07a1.7 1.7 0 0 0 1.46-.85 1.7 1.7 0 0 0 .3-1 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.3 1.7 1.7 0 0 0 .85-1.46V2.8a2 2 0 1 1 4 0v.07a1.7 1.7 0 0 0 .85 1.46 1.7 1.7 0 0 0 1 .3 1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.4 9c0 .37.1.72.3 1 .35.55.9.88 1.46.85H21a2 2 0 1 1 0 4h-.07a1.7 1.7 0 0 0-1.46.85c-.2.28-.3.63-.3 1Z" />
        </svg>
      </button>

      <div className="invisible absolute right-0 top-full w-44 translate-y-1 opacity-0 transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <div className="mt-2 rounded-xl border border-white/70 bg-white/95 p-2 text-sm text-[#193059] shadow-lg">
          <Link
            href="/admin/users"
            className="block rounded-lg px-3 py-2 font-medium transition hover:bg-[#E8F1FA] hover:text-[#407FC2]"
          >
            Manage users
          </Link>
        </div>
      </div>
    </div>
  );
}
