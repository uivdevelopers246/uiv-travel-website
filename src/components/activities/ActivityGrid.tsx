"use client";

import { useState } from "react";
import { ActivityCard } from "./ActivityCard";
import { ActivityFilters, type ActivityFilterState } from "./ActivityFilters";
import type { ActivityDisplay } from "@/lib/activities/types";

type Props = {
  activities: ActivityDisplay[];
  totalCount: number;
  filters: ActivityFilterState;
  onFiltersChange: (filters: ActivityFilterState) => void;
  onClearFilters: () => void;
  showFilters?: boolean;
  showHeader?: boolean;
};

export function ActivityGrid({ activities, totalCount, filters, onFiltersChange, onClearFilters, showFilters = true, showHeader = true }: Props) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  return (
    <div>
      {showHeader && (
        <div className="text-center mb-8">
          <h2 
            className="text-3xl md:text-4xl font-bold text-[#193059] mb-4"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Activities
          </h2>
          <p 
            className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Discover unforgettable adventures and unique experiences in beautiful Barbados.
          </p>
        </div>
      )}

      {showFilters && (
        <div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(open => !open)}
            className="mb-8 flex w-full items-center justify-between rounded-full border border-[#d8e5f2] bg-white px-5 py-3 text-left text-sm font-semibold text-[#193059] shadow-[0_10px_30px_rgba(25,48,89,0.08)] transition-colors hover:border-[#407FC2] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059] md:hidden"
            style={{ fontFamily: "var(--font-source-sans)" }}
            aria-expanded={mobileFiltersOpen}
            aria-controls="activity-filters-panel"
          >
            <span>{mobileFiltersOpen ? "Hide filters" : "Show filters"}</span>
            <svg
              className={`h-4 w-4 transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="m6 9 6 6 6-6"
              />
            </svg>
          </button>

          <div
            id="activity-filters-panel"
            className={mobileFiltersOpen ? "block md:block" : "hidden md:block"}
          >
            <ActivityFilters filters={filters} onChange={onFiltersChange} />
          </div>
        </div>
      )}

      {/* Count */}
      <div className="text-center mb-8">
        <p 
          role="status" aria-live="polite" aria-atomic="true"
          className="text-gray-600 text-lg"
          style={{ fontFamily: 'var(--font-source-sans)' }}
        >
          Showing {activities.length} of {totalCount} activities
        </p>
      </div>

      {activities.length === 0 ? (
        <div className="mx-auto max-w-2xl py-16 text-center">
          <h3 className="mb-3 text-2xl font-bold text-[#193059]" style={{ fontFamily: "var(--font-playfair)" }}>
            {totalCount === 0 ? "No activities listed yet" : "No activities match these filters"}
          </h3>
          <p className="mx-auto mb-6 max-w-md text-base text-slate-600">
            {totalCount === 0 ? "Check back soon to explore activities in Barbados." : "Try fewer filters or clear them to see all activities."}
          </p>
          {totalCount > 0 && (
            <button type="button" onClick={onClearFilters}
              className="rounded-full bg-[#193059] px-6 py-3 text-base font-semibold text-white hover:bg-[#2f6da8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059]">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-8 lg:grid-cols-3">
          {activities.map(activity => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}
