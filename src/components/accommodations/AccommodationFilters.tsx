"use client";

import { useId } from "react";
import { accommodationTypes, bedroomFilters, priceRangeFilters } from "@/lib/accommodations/constants";
import type { AccommodationFilterState } from "./filters";
export type { AccommodationFilterState } from "./filters";

type Props = {
  filters: AccommodationFilterState;
  onChange: (filters: AccommodationFilterState) => void;
};

const fieldClass = "w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-base text-[#193059] placeholder:text-slate-600 focus:border-[#407FC2] focus:outline-2 focus:outline-offset-2 focus:outline-[#407FC2]";
const labelClass = "mb-3 block text-sm font-semibold text-gray-700";

export function AccommodationFilters({ filters, onChange }: Props) {
  const id = useId();
  return (
    <div className="mb-8 rounded-lg bg-gray-50 p-5 sm:p-8">
      <h3 className="mb-6 text-xl font-bold text-[#193059]" style={{ fontFamily: "var(--font-playfair)" }}>
        Filter Accommodations
      </h3>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <label htmlFor={`${id}-type`} className={labelClass}>Type</label>
          <select id={`${id}-type`} className={fieldClass} value={filters.type} onChange={e => onChange({ ...filters, type: e.target.value })}>
            <option value="all">All Types</option>
            {accommodationTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-bedrooms`} className={labelClass}>Bedrooms</label>
          <select id={`${id}-bedrooms`} className={fieldClass} value={filters.bedrooms} onChange={e => onChange({ ...filters, bedrooms: e.target.value })}>
            {bedroomFilters.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-price`} className={labelClass}>Price per Night (USD)</label>
          <select id={`${id}-price`} className={fieldClass} value={filters.priceRange} onChange={e => onChange({ ...filters, priceRange: e.target.value })}>
            {priceRangeFilters.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-party`} className={labelClass}>Guests</label>
          <input id={`${id}-party`} type="number" min="1" step="1" inputMode="numeric" placeholder="Any party size" className={fieldClass}
            aria-describedby={`${id}-party-hint`} value={filters.partySize ?? ""} onChange={e => {
              const value = e.target.valueAsNumber;
              onChange({ ...filters, partySize: Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null });
            }} />
          <p id={`${id}-party-hint`} className="mt-2 text-sm text-slate-600">Travelers in your party.</p>
        </div>
      </div>
    </div>
  );
}
