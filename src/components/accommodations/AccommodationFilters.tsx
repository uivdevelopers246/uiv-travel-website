"use client";

import { accommodationTypes, bedroomFilters, priceRangeFilters } from "@/lib/accommodations/constants";

export type AccommodationFilterState = {
  type: string;
  bedrooms: string;
  priceRange: string;
  maxGuests: number;
};

type Props = {
  filters: AccommodationFilterState;
  onChange: (filters: AccommodationFilterState) => void;
};

export function AccommodationFilters({ filters, onChange }: Props) {
  return (
    <div className="bg-gray-50 p-8 rounded-lg mb-12">
      <h3 
        className="text-xl font-bold text-gray-900 mb-6"
        style={{ fontFamily: 'var(--font-playfair)' }}
      >
        Filter Accommodations
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Type Filter */}
        <div>
          <label 
            className="block text-sm font-semibold text-gray-700 mb-3"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Type
          </label>
          <select 
            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
            value={filters.type}
            onChange={(e) => onChange({ ...filters, type: e.target.value })}
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            <option value="all">All Types</option>
            {accommodationTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Bedrooms Filter */}
        <div>
          <label 
            className="block text-sm font-semibold text-gray-700 mb-3"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Bedrooms
          </label>
          <select 
            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
            value={filters.bedrooms}
            onChange={(e) => onChange({ ...filters, bedrooms: e.target.value })}
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            {bedroomFilters.map(filter => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>

        {/* Price Range Filter */}
        <div>
          <label 
            className="block text-sm font-semibold text-gray-700 mb-3"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Price per Night
          </label>
          <select 
            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
            value={filters.priceRange}
            onChange={(e) => onChange({ ...filters, priceRange: e.target.value })}
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            {priceRangeFilters.map(filter => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>

        {/* Max Guests Filter */}
        <div>
          <label 
            className="block text-sm font-semibold text-gray-700 mb-3"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Max Guests: {filters.maxGuests}
          </label>
          <input 
            type="range"
            min="1"
            max="20"
            value={filters.maxGuests}
            onChange={(e) => onChange({ ...filters, maxGuests: parseInt(e.target.value) })}
            className="w-full h-2 bg-gradient-to-r from-[#FBCA1A] to-[#407FC2] rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#407FC2' }}
          />
        </div>
      </div>
    </div>
  );
}
