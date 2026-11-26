"use client";

import { useId } from "react";
import { activityCategories, durationFilters } from "@/lib/activities/constants";
import type { ActivityFilterState } from "./filters";
export type { ActivityFilterState } from "./filters";

type Props = {
  filters: ActivityFilterState;
  onChange: (filters: ActivityFilterState) => void;
};

const fieldClass = "w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-base text-[#193059] placeholder:text-slate-600 focus:border-[#407FC2] focus:outline-2 focus:outline-offset-2 focus:outline-[#407FC2]";
const labelClass = "mb-3 block text-sm font-semibold text-gray-700";

export function ActivityFilters({ filters, onChange }: Props) {
  const id = useId();
  return (
    <div className="mb-8 rounded-lg bg-gray-50 p-5 sm:p-8">
      <h3 className="mb-6 text-xl font-bold text-[#193059]" style={{ fontFamily: "var(--font-playfair)" }}>
        Filter Activities
      </h3>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <label htmlFor={`${id}-category`} className={labelClass}>Category</label>
          <select id={`${id}-category`} className={fieldClass} value={filters.category} onChange={e => onChange({ ...filters, category: e.target.value })}>
            <option value="all">All Categories</option>
            {activityCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-price`} className={labelClass}>Max price per person (USD)</label>
          <input id={`${id}-price`} type="number" min="0" step="any" inputMode="decimal" placeholder="Any price" className={fieldClass}
            value={filters.maxPrice ?? ""} onChange={e => {
              const value = e.target.valueAsNumber;
              onChange({ ...filters, maxPrice: Number.isFinite(value) ? Math.max(0, value) : null });
            }} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-duration`} className={labelClass}>Duration</label>
          <select id={`${id}-duration`} className={fieldClass} value={filters.duration} onChange={e => onChange({ ...filters, duration: e.target.value })}>
            {durationFilters.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-party`} className={labelClass}>Group size</label>
          <input id={`${id}-party`} type="number" min="1" step="1" inputMode="numeric" placeholder="Any group size" className={fieldClass}
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
