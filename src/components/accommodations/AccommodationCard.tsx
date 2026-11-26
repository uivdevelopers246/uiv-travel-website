"use client";

import Link from "next/link";
import { accommodationTypes } from "@/lib/accommodations/constants";
import { getSafeImageUrl, DEFAULT_IMAGE_FALLBACK } from "@/lib/utils/image";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import { formatAccommodationNightlyPrice } from "./pricing";

type Props = {
  accommodation: AccommodationDisplay;
};

export function AccommodationCard({ accommodation }: Props) {
  const typeLabel = accommodationTypes.find(t => t.value === accommodation.accommodation_type)?.label || accommodation.accommodation_type;
  const safeImageUrl = getSafeImageUrl(accommodation.image_url, DEFAULT_IMAGE_FALLBACK);
  
  return (
    <Link href={`/accommodations/${accommodation.id}`} aria-label={`View ${accommodation.name}`} className="block h-full min-w-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059]">
      <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-lg motion-safe:hover:-translate-y-1 motion-reduce:transition-none cursor-pointer">
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-100">
          <img
            src={safeImageUrl}
            alt={accommodation.name}
            className="h-full w-full object-cover transition duration-300 motion-safe:group-hover:scale-105 motion-reduce:transition-none"
          />
          {accommodation.is_featured && (
            <span className="absolute top-2 left-2 rounded-full bg-[#FBCA1A] px-2 py-0.5 text-sm font-semibold text-[#193059] sm:top-3 sm:left-3 sm:px-3 sm:py-1">
              Featured
            </span>
          )}
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-white/90 px-2 py-0.5 text-sm font-medium text-[#193059] backdrop-blur-sm sm:top-3 sm:right-3 sm:bottom-auto sm:left-auto sm:px-3 sm:py-1">
            {typeLabel}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-3 sm:p-6">
          <div className="flex min-w-0 flex-col gap-1 text-sm uppercase tracking-wide text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span className="truncate">{accommodation.parish ?? accommodation.address ?? "Barbados"}</span>
            {accommodation.vendors?.name && <span className="truncate">{accommodation.vendors.name}</span>}
          </div>
          <h3 className="mt-2 min-h-12 break-words text-base leading-6 font-semibold text-slate-900 line-clamp-2 sm:mt-3 sm:min-h-14 sm:text-xl sm:leading-7">
            {accommodation.name}
          </h3>
          <div className="mb-3 mt-3 flex flex-wrap items-center gap-1.5 text-sm text-slate-600 sm:mb-4 sm:mt-4 sm:gap-3">
            {accommodation.bedroom_count != null && (
              <span>{accommodation.bedroom_count} {accommodation.bedroom_count === 1 ? "bedroom" : "bedrooms"}</span>
            )}
            {accommodation.bathroom_count != null && (
              <span>{accommodation.bathroom_count} {accommodation.bathroom_count === 1 ? "bath" : "baths"}</span>
            )}
            {accommodation.max_guest_capacity != null && (
              <span>{accommodation.max_guest_capacity} guests</span>
            )}
          </div>
          <div className="mt-auto flex flex-col items-start gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between sm:pt-4">
            <span className={accommodation.price_min_usd == null ? "min-w-0 break-words text-sm text-slate-600" : "min-w-0 break-words text-sm font-bold text-[#193059] sm:text-lg"}>
              {formatAccommodationNightlyPrice(accommodation)}
            </span>
            <span className="w-full shrink-0 rounded-full bg-[#193059] px-3 py-2 text-center text-sm font-medium text-white transition-colors group-hover:bg-[#2f6da8] sm:w-auto sm:px-4">
              View
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
