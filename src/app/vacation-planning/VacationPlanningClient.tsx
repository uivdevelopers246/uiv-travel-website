"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { activityCategories, durationFilters } from "@/lib/activities/constants";

type Activity = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  duration_hours: number | null;
  price_per_person: number | null;
  max_capacity: number | null;
  image_url: string | null;
  vendors?: { name: string | null } | null;
};

type ActiveTab = "activities" | "accommodations" | null;

type Props = {
  activities: Activity[];
};

export function VacationPlanningClient({ activities }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);
  const [filters, setFilters] = useState({
    category: "all",
    priceRange: [0, 200],
    duration: "all",
    maxGroupSize: 25,
  });

  const toggleTab = (tab: ActiveTab) => {
    setActiveTab(activeTab === tab ? null : tab);
  };

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
    <>
      {/* Hero Section */}
      <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img 
            src="/images/hero/TropicalFish.png" 
            alt="Tropical Fish" 
            className="w-full h-full object-cover brightness-95"
          />
        </div>
        <div className="absolute inset-0 bg-black/20"></div>
        
        {/* Hero Content */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-20">
          <h1 
            className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 text-white"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Vacation Planning
          </h1>
          
          <p 
            className="text-lg md:text-xl text-white/90 mb-8 max-w-3xl mx-auto leading-relaxed"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Plan your perfect Barbados getaway. Browse activities and accommodations to create an unforgettable experience.
          </p>
        </div>
      </section>

      {/* Vacation Planning Specific Content Section - Easy to add content later */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Placeholder for future vacation planning specific content */}
          {/* Add itinerary builder, trip summary, AI recommendations etc. here */}
        </div>
      </section>

      {/* Toggle Buttons Section */}
      <section className="py-8 bg-gray-50">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => toggleTab("activities")}
              className={`px-8 py-4 text-lg font-semibold rounded-lg transition-all duration-300 ${
                activeTab === "activities"
                  ? "bg-gradient-to-r from-[#407FC2] to-[#193059] text-white shadow-lg"
                  : "bg-white border-2 border-[#407FC2] text-[#407FC2] hover:bg-[#407FC2]/10"
              }`}
              style={{ fontFamily: 'var(--font-source-sans)' }}
            >
              Activities
            </button>
            <button
              onClick={() => toggleTab("accommodations")}
              className={`px-8 py-4 text-lg font-semibold rounded-lg transition-all duration-300 ${
                activeTab === "accommodations"
                  ? "bg-gradient-to-r from-[#407FC2] to-[#193059] text-white shadow-lg"
                  : "bg-white border-2 border-[#407FC2] text-[#407FC2] hover:bg-[#407FC2]/10"
              }`}
              style={{ fontFamily: 'var(--font-source-sans)' }}
            >
              Accommodations
            </button>
          </div>
        </div>
      </section>

      {/* Dynamic Content Section */}
      {activeTab && (
        <section className="py-16 bg-white">
          <div className="container mx-auto px-4 max-w-7xl">
            {activeTab === "activities" && (
              <div>
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

                {/* Filter Section */}
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
                        onChange={(e) => setFilters({ ...filters, category: e.target.value })}
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
                        onChange={(e) => setFilters({ ...filters, priceRange: [0, parseInt(e.target.value)] })}
                        className="w-full h-2 bg-gradient-to-r from-[#FBCA1A] to-[#407FC2] rounded-lg appearance-none cursor-pointer"
                        style={{
                          accentColor: '#407FC2'
                        }}
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
                        onChange={(e) => setFilters({ ...filters, duration: e.target.value })}
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
                        onChange={(e) => setFilters({ ...filters, maxGroupSize: parseInt(e.target.value) })}
                        className="w-full h-2 bg-gradient-to-r from-[#FBCA1A] to-[#407FC2] rounded-lg appearance-none cursor-pointer"
                        style={{
                          accentColor: '#407FC2'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Activities Grid */}
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
                      <article
                        key={activity.id}
                        className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                          <img
                            src={activity.image_url ?? "/images/hero/ScenicHill.JPG"}
                            alt={activity.title}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        </div>
                        <div className="p-6">
                          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                            <span>{activity.category.replace("-", " ")}</span>
                            {activity.vendors?.name && <span>{activity.vendors.name}</span>}
                          </div>
                          <h3 className="mt-3 text-xl font-semibold text-slate-900">
                            {activity.title}
                          </h3>
                          <p className="mt-2 text-sm text-slate-600 line-clamp-3">
                            {activity.description ?? "No description provided yet."}
                          </p>
                          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            {activity.location && <span>{activity.location}</span>}
                            {activity.duration_hours != null && (
                              <span>{activity.duration_hours} hrs</span>
                            )}
                            {activity.price_per_person != null && (
                              <span>${activity.price_per_person.toFixed(0)}</span>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "accommodations" && (
              <div className="text-center">
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
                <Link
                  href="/accommodations"
                  className="inline-block px-8 py-3 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white rounded-lg text-lg font-medium transition-all duration-300"
                >
                  Browse All Accommodations
                </Link>

                {/* Placeholder for embedded accommodations content */}
                <div className="mt-12 p-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <p className="text-gray-500">Accommodations preview coming soon...</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Additional Vacation Planning Content Section - Easy to add content later */}
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Placeholder for future vacation planning specific content */}
          {/* Add trip tips, packing lists, weather info, etc. here */}
        </div>
      </section>
    </>
  );
}
