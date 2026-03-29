"use client";

import Link from "next/link";
import { getSafeImageUrl, DEFAULT_IMAGE_FALLBACK } from "@/lib/utils/image";
import type { ActivityDisplay } from "@/lib/activities/types";

type Props = {
  activity: ActivityDisplay;
};

export function ActivityCard({ activity }: Props) {
  const safeImageUrl = getSafeImageUrl(activity.image_url, DEFAULT_IMAGE_FALLBACK);

  return (
    <Link href={`/activities/${activity.id}`}>
      <article className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
          <img
            src={safeImageUrl}
            alt={activity.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span>{activity.category.replace("-", " ")}</span>
            {activity.vendors?.name && <span>{activity.vendors.name}</span>}
          </div>
          <h3 className="mt-3 text-xl font-semibold text-slate-900">
            {activity.title}
          </h3>
          <p className="mt-2 text-sm text-slate-600 line-clamp-3">
            {activity.description ?? "No description provided yet."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {activity.location && <span>{activity.location}</span>}
            {activity.duration_hours != null && (
              <span>{activity.duration_hours} hrs</span>
            )}
            {activity.price_per_person != null && (
              <span>${activity.price_per_person.toFixed(0)}</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
