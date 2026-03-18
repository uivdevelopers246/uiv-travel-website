"use client";

import { useState } from "react";
import Link from "next/link";

type ActiveTab = "activities" | "accommodations" | null;

export function VacationPlanningClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);

  const toggleTab = (tab: ActiveTab) => {
    setActiveTab(activeTab === tab ? null : tab);
  };

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
              <div className="text-center">
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
                <Link
                  href="/activities"
                  className="inline-block px-8 py-3 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white rounded-lg text-lg font-medium transition-all duration-300"
                >
                  Browse All Activities
                </Link>

                {/* Placeholder for embedded activities content */}
                <div className="mt-12 p-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <p className="text-gray-500">Activities preview coming soon...</p>
                </div>
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
