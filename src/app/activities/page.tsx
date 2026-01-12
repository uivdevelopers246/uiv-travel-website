"use client";

import { Header } from "@/components/layout/header";
import { useState } from "react";

export default function ActivitiesPage() {
  const [filters, setFilters] = useState({
    category: "all",
    priceRange: [0, 200],
    duration: "all",
    maxGroupSize: 25
  });

  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img 
            src="/images/hero/ScenicHill.JPG" 
            alt="Activities & Experiences" 
            className="w-full h-full object-cover brightness-90"
          />
        </div>
        <div className="absolute inset-0 bg-black/30"></div>
        
        {/* Hero Content */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-20">
          <h1 
            className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 text-white"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Activities & Experiences
          </h1>
          
          <p 
            className="text-lg md:text-xl text-white/95 mb-8 max-w-3xl mx-auto leading-relaxed"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Discover unforgettable adventures and unique experiences in beautiful Barbados.
            From thrilling water sports to cultural tours, create memories that will last a lifetime.
          </p>
          
          <button 
            className="bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white px-8 py-3 text-base font-medium transition-all duration-300"
            style={{ fontFamily: 'var(--font-source-sans)' }}
          >
            Browse All Activities
          </button>
        </div>
      </section>

      {/* Filter Section */}
      <section className="bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-7xl">
          <h2 
            className="text-3xl font-bold text-gray-900 mb-8"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Filter Activities
          </h2>
          
          <div className="bg-white p-8 rounded-lg shadow-sm">
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
                  <option value="water-sports">Water Sports</option>
                  <option value="wildlife">Wildlife</option>
                  <option value="adventure">Adventure</option>
                  <option value="culture">Culture</option>
                  <option value="nature">Nature</option>
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
                  <option value="all">Any Duration</option>
                  <option value="1-2">1-2 hours</option>
                  <option value="3-4">3-4 hours</option>
                  <option value="5-6">5-6 hours</option>
                  <option value="full-day">Full Day</option>
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
        </div>
      </section>

      {/* Activities Section - Empty State */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-12">
            <h2 
              className="text-3xl font-bold text-gray-900 mb-4"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              Available Activities
            </h2>
            <p 
              className="text-gray-600 text-lg"
              style={{ fontFamily: 'var(--font-source-sans)' }}
            >
              Showing 0 of 0 activities
            </p>
          </div>

          {/* Empty State */}
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
              We're currently setting up our activities database. Check back soon for exciting experiences and adventures in Barbados!
            </p>
            
            <button 
              className="bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white px-6 py-3 text-base font-medium transition-all duration-300"
              style={{ fontFamily: 'var(--font-source-sans)' }}
            >
              Notify Me When Available
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
