"use client";

import { activityCategories, durationFilters } from "@/lib/activities/constants";

export type ActivityFilterState = {
  category: string;
  priceRange: [number, number];
  duration: string;
  maxGroupSize: number;
};

type Props = {
  filters: ActivityFilterState;
  onChange: (filters: ActivityFilterState) => void;
};

export function ActivityFilters({ filters, onChange }: Props) {
  return (
    <div className="bg-gray-50 p-8 rounded-lg mb-12">
      <h3 
        className="text-xl font-bold text-gray-900 mb-6"
        style={{ fontFamily: 'var(--font-playfair)' }}
      >
        Filter Activities
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Category Filter */}
        <div>
          <label 
            className="block text-sm font-semibold text-gray-700 mb-3"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Category
          </label>
          <select 
            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
            value={filters.category}
            onChange={(e) => onChange({ ...filters, category: e.target.value })}
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            <option value="all">All Categories</option>
            {activityCategories.map(category => (
              <option key={category.value} value={category.value}>
                {category.label}
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
            Price Range: ${filters.priceRange[0]} - ${filters.priceRange[1]}
          </label>
          <input 
            type="range"
            min="0"
            max="200"
            value={filters.priceRange[1]}
            onChange={(e) => onChange({ ...filters, priceRange: [0, parseInt(e.target.value)] })}
            className="w-full h-2 bg-gradient-to-r from-[#FBCA1A] to-[#407FC2] rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#407FC2' }}
          />
        </div>

        {/* Duration Filter */}
        <div>
          <label 
            className="block text-sm font-semibold text-gray-700 mb-3"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Duration
          </label>
          <select 
            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
            value={filters.duration}
            onChange={(e) => onChange({ ...filters, duration: e.target.value })}
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            {durationFilters.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Max Group Size Filter */}
        <div>
          <label 
            className="block text-sm font-semibold text-gray-700 mb-3"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Max Group Size: {filters.maxGroupSize} people
          </label>
          <input 
            type="range"
            min="1"
            max="50"
            value={filters.maxGroupSize}
            onChange={(e) => onChange({ ...filters, maxGroupSize: parseInt(e.target.value) })}
            className="w-full h-2 bg-gradient-to-r from-[#FBCA1A] to-[#407FC2] rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#407FC2' }}
          />
        </div>
      </div>
    </div>
  );
}
