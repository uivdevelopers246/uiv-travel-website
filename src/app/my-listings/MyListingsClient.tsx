"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getUserRole, type UserRole } from "@/lib/auth/roles";

type Activity = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  status: string;
  price_per_person: number | null;
  image_url: string | null;
  created_at: string;
};

type Accommodation = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  price_per_night: number | null;
  image_url: string | null;
  created_at: string;
};

export function MyListingsClient() {
  const [role, setRole] = useState<UserRole>("guest");
  const [activeTab, setActiveTab] = useState<"activities" | "accommodations">("activities");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const loadData = async () => {
      const nextRole = await getUserRole(supabase);
      if (!active) return;
      setRole(nextRole);

      if (nextRole === "vendor" || nextRole === "admin") {
        // Get user's vendor ID
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user || !active) return;

        const { data: vendorData } = await supabase
          .from("vendors")
          .select("id")
          .eq("owner_user_id", userData.user.id)
          .single();

        if (vendorData && active) {
          // Fetch activities for this vendor
          const { data: activitiesData } = await supabase
            .from("activities")
            .select("id, title, description, location, category, status, price_per_person, image_url, created_at")
            .eq("vendor_id", vendorData.id)
            .order("created_at", { ascending: false });

          if (active) {
            setActivities(activitiesData ?? []);
          }

          // Accommodations table might not exist yet, so we'll handle that gracefully
          // setAccommodations([]);
        }
      }

      if (active) {
        setLoading(false);
      }
    };

    void loadData();

    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadData();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

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
        <div className="mb-8">
          <h1 
            className="text-4xl font-bold text-[#193059] mb-2"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            My Listings
          </h1>
          <p className="text-gray-600">Manage your activities and accommodations</p>
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
          <div>
            {/* Add New Button */}
            <div className="mb-6">
              <Link
                href="/activities/manage"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBCA1A] hover:bg-[#f5c000] text-[#193059] font-semibold rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add New Activity
              </Link>
            </div>

            {activities.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Activities Yet</h3>
                <p className="text-gray-600 mb-6">Start by adding your first activity listing.</p>
                <Link
                  href="/activities/manage"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white font-semibold rounded-lg transition-all duration-300"
                >
                  Create Your First Activity
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="bg-white rounded-lg shadow-sm p-6 flex items-center gap-6"
                  >
                    {/* Image */}
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        src={activity.image_url ?? "/images/hero/ScenicHill.JPG"}
                        alt={activity.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">{activity.title}</h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          activity.status === "published" 
                            ? "bg-emerald-100 text-emerald-700" 
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {activity.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{activity.location ?? "No location set"}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {activity.price_per_person ? `$${activity.price_per_person}` : "Price not set"} • {activity.category.replace("-", " ")}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/activities/manage/${activity.id}`}
                        className="px-4 py-2 text-sm font-medium text-[#407FC2] border border-[#407FC2] rounded-lg hover:bg-[#407FC2] hover:text-white transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "accommodations" && (
          <div>
            {/* Coming Soon for Accommodations */}
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Accommodations Coming Soon</h3>
              <p className="text-gray-600">
                The ability to manage accommodation listings is currently being developed. Check back soon!
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
