"use client";

import { useState } from "react";
import Link from "next/link";
import { ActivityGrid } from "@/components/activities";
import { AccommodationGrid } from "@/components/accommodations";
import type { ActivityDisplay } from "@/lib/activities/types";
import type { AccommodationDisplay } from "@/lib/accommodations/types";

type ActiveTab = "activities" | "accommodations" | null;

type Props = {
  activities: ActivityDisplay[];
  accommodations: AccommodationDisplay[];
};

export function VacationPlanningClient({ activities, accommodations }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);

  const toggleTab = (tab: ActiveTab) => {
    setActiveTab(activeTab === tab ? null : tab);
  };

  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="/images/hero/TropicalFish.png" 
            alt="Tropical Fish" 
            className="w-full h-full object-cover brightness-95"
          />
        </div>
        <div className="absolute inset-0 bg-black/20"></div>
        
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

      {/* Local Lens AI Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center">
            {/* AI Icon */}
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#407FC2] to-[#193059] rounded-full mb-6 shadow-lg">
              <svg 
                className="w-10 h-10 text-white" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={1.5} 
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                />
              </svg>
            </div>

            <h2 
              className="text-3xl md:text-4xl font-bold text-[#193059] mb-2"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              LocalLens.ai
            </h2>
            <p 
              className="text-lg text-[#407FC2] font-medium mb-4"
              style={{ fontFamily: 'var(--font-source-sans)' }}
            >
              Your AI-Powered Travel Assistant
            </p>
            
            <p 
              className="text-lg text-gray-600 mb-6 max-w-2xl mx-auto leading-relaxed"
              style={{ fontFamily: 'var(--font-source-sans)' }}
            >
              LocalLens.ai is learning everything about Barbados to become your personal guide. 
              From hidden local gems to must-see attractions, our AI will help you craft the 
              perfect island experience—tailored to your interests, budget, and travel style.
            </p>

            {/* Feature highlights */}
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#407FC2]/10 text-[#407FC2] rounded-full text-sm font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Personalized Recommendations
              </span>
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#407FC2]/10 text-[#407FC2] rounded-full text-sm font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Local Insider Knowledge
              </span>
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#407FC2]/10 text-[#407FC2] rounded-full text-sm font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Smart Itinerary Building
              </span>
            </div>

            <p 
              className="text-sm text-gray-500 italic mb-6"
              style={{ fontFamily: 'var(--font-source-sans)' }}
            >
              Coming soon: Chat with LocalLens.ai to plan your dream Barbados trip in minutes
            </p>

            <Link 
              href="/locallens"
              className="inline-block px-6 py-3 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white rounded-full text-base font-medium transition-all duration-300"
              style={{ fontFamily: 'var(--font-source-sans)' }}
            >
              Learn More About LocalLens.ai
            </Link>
          </div>
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
              <ActivityGrid activities={activities} />
            )}

            {activeTab === "accommodations" && (
              <AccommodationGrid accommodations={accommodations} />
            )}
          </div>
        </section>
      )}
    </>
  );
}
