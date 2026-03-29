"use client";

import { useState } from "react";
import Link from "next/link";
import { accommodationTypes } from "@/lib/accommodations/constants";
import { DEFAULT_IMAGE_FALLBACK, getSafeImageUrl } from "@/lib/utils/image";

export type Accommodation = {
  id: string;
  name: string;
  accommodation_type: string;
  status: string;
  bedroom_count: number | null;
  bathroom_count: number | null;
  max_guest_capacity: number | null;
  price_min_usd: number | null;
  price_max_usd: number | null;
  address: string | null;
  parish: string | null;
  image_url: string | null;
  created_at: string;
  vendor_id: string;
};

type Props = {
  accommodations: Accommodation[];
  onRefresh: () => Promise<void>;
};

export function ManageAccommodationsClient({
  accommodations,
  onRefresh,
}: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const updateStatus = async (id: string, status: "draft" | "published") => {
    setPendingId(id);
    try {
      const res = await fetch(`/api/accommodations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error ?? "Failed to update accommodation status.");
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
          href="/my-listings/manage/accommodations/new"
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
          Add New Accommodation
        </Link>
      </div>

      {accommodations.length === 0 ? (
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
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-xl font-semibold text-gray-900">
            No Accommodations Yet
          </h3>
          <p className="mb-6 text-gray-600">
            Start by adding your first accommodation listing.
          </p>
          <Link
            href="/my-listings/manage/accommodations/new"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#407FC2] to-[#193059] px-6 py-3 font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
          >
            Create Your First Accommodation
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {accommodations.map((accommodation) => {
            const typeLabel =
              accommodationTypes.find(
                (type) => type.value === accommodation.accommodation_type,
              )?.label || accommodation.accommodation_type;

            return (
              <div
                key={accommodation.id}
                className="flex items-center gap-6 rounded-lg bg-white p-6 shadow-sm"
              >
                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  <img
                    src={getSafeImageUrl(
                      accommodation.image_url,
                      DEFAULT_IMAGE_FALLBACK,
                    )}
                    alt={accommodation.name}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-3">
                    <h3 className="truncate text-lg font-semibold text-gray-900">
                      {accommodation.name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        accommodation.status === "published"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {accommodation.status}
                    </span>
                  </div>
                  <p className="truncate text-sm text-gray-600">
                    {accommodation.parish ??
                      accommodation.address ??
                      "No location set"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {accommodation.price_min_usd
                      ? `$${accommodation.price_min_usd}${
                          accommodation.price_max_usd &&
                          accommodation.price_max_usd !==
                            accommodation.price_min_usd
                            ? `-${accommodation.price_max_usd}`
                            : ""
                        }/night`
                      : "Price not set"}{" "}
                    | {typeLabel} | {accommodation.bedroom_count ?? 0}{" "}
                    bed{(accommodation.bedroom_count ?? 0) !== 1 ? "s" : ""} |{" "}
                    {accommodation.max_guest_capacity ?? 0} guests
                  </p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {accommodation.status !== "published" && (
                    <button
                      onClick={() => updateStatus(accommodation.id, "published")}
                      disabled={pendingId === accommodation.id}
                      className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                    >
                      Publish
                    </button>
                  )}
                  {accommodation.status === "published" && (
                    <button
                      onClick={() => updateStatus(accommodation.id, "draft")}
                      disabled={pendingId === accommodation.id}
                      className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-60"
                    >
                      Unpublish
                    </button>
                  )}
                  <Link
                    href={`/my-listings/manage/accommodations/${accommodation.id}`}
                    className="rounded-lg border border-[#407FC2] px-4 py-2 text-sm font-medium text-[#407FC2] transition-colors hover:bg-[#407FC2] hover:text-white"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
