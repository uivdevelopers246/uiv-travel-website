"use client";

import { useMemo, useState } from "react";
import { AccommodationCard } from "./AccommodationCard";
import { AccommodationFilters, type AccommodationFilterState } from "./AccommodationFilters";
import type { AccommodationDisplay } from "@/lib/accommodations/types";

type Props = {
  accommodations: AccommodationDisplay[];
  showFilters?: boolean;
  showHeader?: boolean;
};

export function AccommodationGrid({ accommodations, showFilters = true, showHeader = true }: Props) {
  const [filters, setFilters] = useState<AccommodationFilterState>({
    type: "all",
    bedrooms: "all",
    priceRange: "all",
    maxGuests: 10,
  });

  const filtered = useMemo(() => {
    return accommodations.filter(accommodation => {
      // Type filter
      if (filters.type !== "all" && accommodation.accommodation_type !== filters.type) {
        return false;
      }

      // Bedroom filter
      if (filters.bedrooms !== "all") {
        const beds = accommodation.bedroom_count || 0;
        if (filters.bedrooms === "4+" && beds < 4) return false;
        if (filters.bedrooms !== "4+" && beds !== parseInt(filters.bedrooms)) return false;
      }

      // Price filter
      if (filters.priceRange !== "all") {
        const price = accommodation.price_min_usd || 0;
        const [min, max] = filters.priceRange.split("-").map(s => s.replace("+", ""));
        if (filters.priceRange.includes("+")) {
          if (price < parseInt(min)) return false;
        } else {
          if (price < parseInt(min) || price > parseInt(max)) return false;
        }
      }

      // Max guests filter
      if (accommodation.max_guest_capacity && accommodation.max_guest_capacity > filters.maxGuests) {
        return false;
      }

      return true;
    });
  }, [accommodations, filters]);

  return (
    <div>
      {showHeader && (
        <div className="text-center mb-8">
          <h2 
            className="text-3xl md:text-4xl font-bold text-[#193059] mb-4"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Accommodations
          </h2>
          <p 
            className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Find the perfect place to stay, from beachfront villas to cozy guesthouses.
          </p>
        </div>
      )}

      {showFilters && (
        <AccommodationFilters filters={filters} onChange={setFilters} />
      )}

      {/* Count */}
      <div className="text-center mb-8">
        <p 
          className="text-gray-600 text-lg"
          style={{ fontFamily: 'var(--font-source-sans)' }}
        >
          Showing {filtered.length} of {accommodations.length} accommodations
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
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" 
              />
            </svg>
          </div>
          
          <h3 
            className="text-2xl font-bold text-gray-900 mb-3"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            No Accommodations Available Yet
          </h3>
          
          <p 
            className="text-gray-600 mb-8 max-w-md mx-auto"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            We&apos;re currently setting up our accommodations database. Check back soon for amazing places to stay in Barbados!
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
          {filtered.map(accommodation => (
            <AccommodationCard key={accommodation.id} accommodation={accommodation} />
          ))}
        </div>
      )}
    </div>
  );
}
