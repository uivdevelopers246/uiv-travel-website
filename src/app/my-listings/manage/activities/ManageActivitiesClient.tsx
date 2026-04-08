"use client";

import { useState } from "react";
import Link from "next/link";
import { DEFAULT_IMAGE_FALLBACK, getSafeImageUrl } from "@/lib/utils/image";

export type Activity = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  status: string;
  price_per_person: number | null;
  image_url: string | null;
  created_at: string;
  vendor_id: string;
};

type Props = {
  activities: Activity[];
  onRefresh: () => Promise<void>;
};

export function ManageActivitiesClient({ activities, onRefresh }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const updateStatus = async (id: string, status: "draft" | "published") => {
    setPendingId(id);
    try {
      const res = await fetch("/api/activities/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error ?? "Failed to update status.");
        return;
      }

      await onRefresh();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/my-listings/manage/activities/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#FBCA1A] px-4 py-2 font-semibold text-[#193059] transition-colors hover:bg-[#f5c000]"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add New Activity
        </Link>
      </div>

      {activities.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-xl font-semibold text-gray-900">
            No Activities Yet
          </h3>
          <p className="mb-6 text-gray-600">
            Start by adding your first activity listing.
          </p>
          <Link
            href="/my-listings/manage/activities/new"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#407FC2] to-[#193059] px-6 py-3 font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
          >
            Create Your First Activity
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center gap-6 rounded-lg bg-white p-6 shadow-sm"
            >
              <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                <img
                  src={getSafeImageUrl(activity.image_url, DEFAULT_IMAGE_FALLBACK)}
                  alt={activity.title}
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-3">
                  <h3 className="truncate text-lg font-semibold text-gray-900">
                    {activity.title}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      activity.status === "published"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {activity.status}
                  </span>
                </div>
                <p className="truncate text-sm text-gray-600">
                  {activity.location ?? "No location set"}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {activity.price_per_person
                    ? `$${activity.price_per_person}`
                    : "Price not set"}{" "}
                  | {activity.category.replace("-", " ")}
                </p>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                {activity.status !== "published" && (
                  <button
                    onClick={() => updateStatus(activity.id, "published")}
                    disabled={pendingId === activity.id}
                    className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                  >
                    Publish
                  </button>
                )}
                {activity.status === "published" && (
                  <button
                    onClick={() => updateStatus(activity.id, "draft")}
                    disabled={pendingId === activity.id}
                    className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-60"
                  >
                    Unpublish
                  </button>
                )}
                <Link
                  href={`/my-listings/manage/activities/${activity.id}`}
                  className="rounded-lg border border-[#407FC2] px-4 py-2 text-sm font-medium text-[#407FC2] transition-colors hover:bg-[#407FC2] hover:text-white"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
