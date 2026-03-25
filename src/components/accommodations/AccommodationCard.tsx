"use client";

import { accommodationTypes } from "@/lib/accommodations/constants";
import { getSafeImageUrl, DEFAULT_IMAGE_FALLBACK } from "@/lib/utils/image";
import type { AccommodationDisplay } from "@/lib/accommodations/types";

type Props = {
  accommodation: AccommodationDisplay;
};

export function AccommodationCard({ accommodation }: Props) {
  const typeLabel = accommodationTypes.find(t => t.value === accommodation.accommodation_type)?.label || accommodation.accommodation_type;
  const safeImageUrl = getSafeImageUrl(accommodation.image_url, DEFAULT_IMAGE_FALLBACK);
  
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 relative">
        <img
          src={safeImageUrl}
          alt={accommodation.name}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        {accommodation.is_featured && (
          <span className="absolute top-3 left-3 bg-[#FBCA1A] text-[#193059] text-xs font-semibold px-3 py-1 rounded-full">
            Featured
          </span>
        )}
        <span className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-[#193059] text-xs font-medium px-3 py-1 rounded-full">
          {typeLabel}
        </span>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
          <span>{accommodation.parish ?? accommodation.address ?? "Barbados"}</span>
          {accommodation.vendors?.name && <span>{accommodation.vendors.name}</span>}
        </div>
        <h3 className="mt-3 text-xl font-semibold text-slate-900">
          {accommodation.name}
        </h3>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
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
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          {accommodation.price_min_usd != null ? (
            <span className="text-lg font-bold text-[#193059]">
              {accommodation.price_max_usd && accommodation.price_max_usd !== accommodation.price_min_usd ? (
                <>${accommodation.price_min_usd} - ${accommodation.price_max_usd}<span className="text-sm font-normal text-slate-500">/night</span></>
              ) : (
                <>${accommodation.price_min_usd}<span className="text-sm font-normal text-slate-500">/night</span></>
              )}
            </span>
          ) : (
            <span className="text-sm text-slate-500">Price on request</span>
          )}
          <button className="px-4 py-2 bg-[#193059] hover:bg-[#407FC2] text-white text-sm font-medium rounded-full transition-colors">
            View
          </button>
        </div>
      </div>
    </article>
  );
}
