"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getUserRole, type UserRole } from "@/lib/auth/roles";
import { withAccommodationBookablePrices } from "@/lib/accommodation-calendar/pricing";
import { ManageActivitiesClient, type Activity } from "./manage/activities/ManageActivitiesClient";
import { ManageAccommodationsClient, type Accommodation } from "./manage/accommodations/ManageAccommodationsClient";

export function MyListingsClient() {
  const [role, setRole] = useState<UserRole>("guest");
  const [activeTab, setActiveTab] = useState<"activities" | "accommodations">("activities");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const nextRole = await getUserRole(supabase);
      setLoadError(null);
      setRole(nextRole);

      if (nextRole !== "admin" && nextRole !== "vendor") return;

      let vendorId: string | null = null;
      if (nextRole === "vendor") {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const { data: vendorData, error: vendorError } = await supabase
          .from("vendors")
          .select("id")
          .eq("owner_user_id", userData.user.id)
          .maybeSingle();
        if (vendorError) throw vendorError;
        if (!vendorData) {
          setActivities([]);
          setAccommodations([]);
          return;
        }
        vendorId = vendorData.id;
      }

      let activityQuery = supabase.from("activities")
        .select("id, title, description, location, category, status, price_per_person, image_url, created_at, vendor_id")
        .order("created_at", { ascending: false });
      let accommodationQuery = supabase.from("accommodations")
        .select("id, name, accommodation_type, status, bedroom_count, bathroom_count, max_guest_capacity, address, parish, image_url, created_at, vendor_id")
        .order("created_at", { ascending: false });
      if (vendorId) {
        activityQuery = activityQuery.eq("vendor_id", vendorId);
        accommodationQuery = accommodationQuery.eq("vendor_id", vendorId);
      }
      const [activityResult, accommodationResult] = await Promise.all([activityQuery, accommodationQuery]);
      if (activityResult.error) throw activityResult.error;
      if (accommodationResult.error) throw accommodationResult.error;
      const pricedAccommodations = await withAccommodationBookablePrices(supabase, accommodationResult.data ?? []);
      setActivities(activityResult.data ?? []);
      setAccommodations(pricedAccommodations);
    } catch {
      setLoadError("Could not load your listings and current nightly prices. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // INITIAL_SESSION loads the first page too. Query after the auth callback releases its lock.
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        if (active) void loadData();
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [loadData]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 pt-24">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center py-12">
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-24">
        <div className="mx-auto max-w-6xl rounded-lg border border-rose-200 bg-white p-8">
          <p role="alert" className="text-rose-700">{loadError}</p>
          <button type="button" onClick={() => { setLoading(true); void loadData(); }}
            className="mt-4 rounded-lg border border-[#193059] px-4 py-2 font-semibold text-[#193059]">Try again</button>
        </div>
      </main>
    );
  }

  if (role !== "vendor" && role !== "admin") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#E8F1FA] via-[#C5E0F5] to-[#193059] flex items-center justify-center pt-20">
        <div className="text-center px-4 max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-[#193059] mb-4" style={{ fontFamily: 'var(--font-playfair)' }}>
            Vendor Access Required
          </h1>
          <p className="text-lg text-[#193059]/60 mb-8 max-w-md mx-auto">
            This page is only accessible to vendors. If you&apos;re a vendor, please sign in with your vendor account.
          </p>
          <Link
            href="/auth/login"
            className="inline-block px-8 py-3 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white rounded-full text-lg font-medium transition-all duration-300"
          >
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pt-24">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1
              className="text-4xl font-bold text-[#193059] mb-2"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              My Listings
            </h1>
            <p className="text-gray-600">Manage your activities and accommodations</p>
          </div>

          {role === "vendor" ? (
            <Link
              href="/my-listings/bookings"
              className="inline-flex items-center justify-center rounded-full border border-[#193059] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#193059] hover:text-white"
            >
              View booking requests
            </Link>
          ) : null}
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab("activities")}
            className={`px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-300 ${
              activeTab === "activities"
                ? "bg-gradient-to-r from-[#407FC2] to-[#193059] text-white shadow-md"
                : "bg-white border border-gray-300 text-gray-700 hover:border-[#407FC2] hover:text-[#407FC2]"
            }`}
          >
            Activities ({activities.length})
          </button>
          <button
            onClick={() => setActiveTab("accommodations")}
            className={`px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-300 ${
              activeTab === "accommodations"
                ? "bg-gradient-to-r from-[#407FC2] to-[#193059] text-white shadow-md"
                : "bg-white border border-gray-300 text-gray-700 hover:border-[#407FC2] hover:text-[#407FC2]"
            }`}
          >
            Accommodations ({accommodations.length})
          </button>
        </div>

        {/* Content */}
        {activeTab === "activities" && (
          <ManageActivitiesClient
            activities={activities}
            onRefresh={loadData}
          />
        )}

        {activeTab === "accommodations" && (
          <ManageAccommodationsClient
            accommodations={accommodations}
            onRefresh={loadData}
          />
        )}
      </div>
    </main>
  );
}
