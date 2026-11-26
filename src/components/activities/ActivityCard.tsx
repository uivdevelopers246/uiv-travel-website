"use client";

import Link from "next/link";
import { getSafeImageUrl, DEFAULT_IMAGE_FALLBACK } from "@/lib/utils/image";
import type { ActivityDisplay } from "@/lib/activities/types";

type Props = {
  activity: ActivityDisplay;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export function ActivityCard({ activity }: Props) {
  const safeImageUrl = getSafeImageUrl(activity.image_url, DEFAULT_IMAGE_FALLBACK);

  return (
    <Link href={`/activities/${activity.id}`} aria-label={`View ${activity.title}`} className="block h-full min-w-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059]">
      <article className="group h-full min-w-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-lg motion-safe:hover:-translate-y-1 motion-reduce:transition-none cursor-pointer">
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
          <img
            src={safeImageUrl}
            alt={activity.title}
            className="h-full w-full object-cover transition duration-300 motion-safe:group-hover:scale-105 motion-reduce:transition-none"
          />
        </div>
        <div className="p-3 sm:p-6">
          <div className="flex min-w-0 flex-col gap-1 text-sm uppercase tracking-wide text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span className="truncate">{activity.category.replace("-", " ")}</span>
            {activity.vendors?.name && <span className="truncate">{activity.vendors.name}</span>}
          </div>
          <h3 className="mt-2 min-h-12 break-words text-base leading-6 font-semibold text-slate-900 line-clamp-2 sm:mt-3 sm:min-h-14 sm:text-xl sm:leading-7">
            {activity.title}
          </h3>
          <p className="mt-2 text-sm text-slate-600 line-clamp-2 sm:line-clamp-3">
            {activity.description ?? "No description provided yet."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-slate-600 sm:mt-4 sm:gap-3">
            {activity.location && <span className="line-clamp-2 w-full break-words sm:w-auto">{activity.location}</span>}
            {activity.duration_hours != null && (
              <span>{activity.duration_hours} hrs</span>
            )}
            {activity.price_per_person != null && (
              <span>{currency.format(activity.price_per_person)} /person</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
