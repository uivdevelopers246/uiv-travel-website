"use client";

import { useMemo, useState } from "react";
import { ActivityCard } from "./ActivityCard";
import { ActivityFilters, type ActivityFilterState } from "./ActivityFilters";
import type { ActivityDisplay } from "@/lib/activities/types";

type Props = {
  activities: ActivityDisplay[];
  showFilters?: boolean;
  showHeader?: boolean;
};

export function ActivityGrid({ activities, showFilters = true, showHeader = true }: Props) {
  const [filters, setFilters] = useState<ActivityFilterState>({
    category: "all",
    priceRange: [0, 200],
    duration: "all",
    maxGroupSize: 25,
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    return activities.filter(activity => {
      if (filters.category !== "all" && activity.category !== filters.category) {
        return false;
      }

      if (
        typeof activity.price_per_person === "number" &&
        activity.price_per_person > filters.priceRange[1]
      ) {
        return false;
      }

      if (filters.duration !== "all" && activity.duration_hours != null) {
        const hours = activity.duration_hours;
        if (filters.duration === "1-2" && (hours < 1 || hours > 2)) return false;
        if (filters.duration === "3-4" && (hours < 3 || hours > 4)) return false;
        if (filters.duration === "5-6" && (hours < 5 || hours > 6)) return false;
        if (filters.duration === "full-day" && hours < 7) return false;
      }

      if (
        typeof activity.max_capacity === "number" &&
        activity.max_capacity > filters.maxGroupSize
      ) {
        return false;
      }

      return true;
    });
  }, [activities, filters]);

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
            className="mb-8 flex w-full items-center justify-between rounded-full border border-[#d8e5f2] bg-white px-5 py-3 text-left text-sm font-semibold text-[#193059] shadow-[0_10px_30px_rgba(25,48,89,0.08)] transition-colors hover:border-[#407FC2] md:hidden"
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
            <ActivityFilters filters={filters} onChange={setFilters} />
          </div>
        </div>
      )}

      {/* Count */}
      <div className="text-center mb-8">
        <p 
          className="text-gray-600 text-lg"
          style={{ fontFamily: 'var(--font-source-sans)' }}
        >
          Showing {filtered.length} of {activities.length} activities
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="mb-6">
            <svg 
              className="w-24 h-24 mx-auto text-gray-300" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" 
              />
            </svg>
          </div>
          
          <h3 
            className="text-2xl font-bold text-gray-900 mb-3"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            No Activities Available Yet
          </h3>
          
          <p 
            className="text-gray-600 mb-8 max-w-md mx-auto"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            We&apos;re currently setting up our activities database. Check back soon for exciting experiences and adventures in Barbados!
          </p>
          
          <button 
            className="bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white px-6 py-3 text-base font-medium transition-all duration-300"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Notify Me When Available
          </button>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(activity => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}
