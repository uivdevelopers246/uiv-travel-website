"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getUserRole, type UserRole } from "@/lib/auth/roles";
import { activityCategories } from "@/lib/activities/constants";

type ActivityCategory = (typeof activityCategories)[number]["value"];

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
  vendor_id: string;
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
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("guest");
  const [activeTab, setActiveTab] = useState<"activities" | "accommodations">("activities");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorId, setVendorId] = useState<string | null>(null);
  
  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    location: string;
    category: ActivityCategory;
    duration_hours: string;
    price_per_person: string;
    max_capacity: string;
    image_url: string;
  }>({
    title: "",
    description: "",
    location: "",
    category: activityCategories[0]?.value ?? "water-sports",
    duration_hours: "",
    price_per_person: "",
    max_capacity: "",
    image_url: "",
  });

  const loadData = async () => {
    const supabase = createClient();
    const nextRole = await getUserRole(supabase);
    setRole(nextRole);

    if (nextRole === "admin") {
      // Admin sees all activities across all vendors
      const [{ data: activitiesData }, { data: vendorData }] = await Promise.all([
        supabase
          .from("activities")
          .select("id, title, description, location, category, status, price_per_person, image_url, created_at, vendor_id")
          .order("created_at", { ascending: false }),
        supabase.from("vendors").select("id").limit(1).maybeSingle(),
      ]);

      setActivities(activitiesData ?? []);
      // Set a default vendor ID for creating new activities (admin can use any vendor)
      if (vendorData) {
        setVendorId(vendorData.id);
      }
    } else if (nextRole === "vendor") {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: vendorData } = await supabase
        .from("vendors")
        .select("id")
        .eq("owner_user_id", userData.user.id)
        .single();

      if (vendorData) {
        setVendorId(vendorData.id);
        const { data: activitiesData } = await supabase
          .from("activities")
          .select("id, title, description, location, category, status, price_per_person, image_url, created_at, vendor_id")
          .eq("vendor_id", vendorData.id)
          .order("created_at", { ascending: false });

        setActivities(activitiesData ?? []);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const init = async () => {
      await loadData();
    };

    void init();

    const { data } = supabase.auth.onAuthStateChange(() => {
      if (active) void loadData();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const updateStatus = async (id: string, status: "draft" | "published") => {
    setPendingId(id);
    try {
      const res = await fetch("/api/activities/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error ?? "Failed to update status.");
        return;
      }

      await loadData();
    } finally {
      setPendingId(null);
    }
  };

  const createDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setMessage(null);

    if (!vendorId) {
      setMessage("Vendor ID not found.");
      setCreating(false);
      return;
    }

    if (!form.title.trim()) {
      setMessage("Title is required.");
      setCreating(false);
      return;
    }

    let imageUrl = form.image_url.trim() || null;

    if (imageFile) {
      try {
        const supabase = createClient();
        const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "";
        const allowedExtensions = ["jpg", "jpeg", "png", "gif", "webp"];

        if (!allowedExtensions.includes(fileExt)) {
          setMessage("Only image files are allowed (jpg, jpeg, png, gif, webp).");
          setCreating(false);
          return;
        }

        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const objectPath = `${vendorId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("activity-images")
          .upload(objectPath, imageFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: imageFile.type || "image/jpeg",
          });

        if (uploadError) {
          setMessage(uploadError.message);
          setCreating(false);
          return;
        }

        const { data } = supabase.storage
          .from("activity-images")
          .getPublicUrl(objectPath);

        imageUrl = data.publicUrl;
      } catch (error: any) {
        setMessage(error?.message ?? "Image upload failed.");
        setCreating(false);
        return;
      }
    }

    const payload = {
      vendor_id: vendorId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      category: form.category,
      duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
      price_per_person: form.price_per_person ? Number(form.price_per_person) : null,
      max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
      image_url: imageUrl,
    };

    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error ?? "Failed to create activity.");
        setCreating(false);
        return;
      }

      setForm({
        title: "",
        description: "",
        location: "",
        category: activityCategories[0]?.value ?? "water-sports",
        duration_hours: "",
        price_per_person: "",
        max_capacity: "",
        image_url: "",
      });
      setImageFile(null);
      setShowCreate(false);
      await loadData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to create activity";
      setMessage(msg);
    } finally {
      setCreating(false);
    }
  };

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
              <button
                onClick={() => setShowCreate(prev => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBCA1A] hover:bg-[#f5c000] text-[#193059] font-semibold rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {showCreate ? "Cancel" : "Add New Activity"}
              </button>
            </div>

            {/* Create Form */}
            {showCreate && (
              <form onSubmit={createDraft} className="mb-8 bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Activity</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                    <input
                      value={form.title}
                      onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                      placeholder="Enter activity title"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent min-h-[100px]"
                      placeholder="Describe the activity..."
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        value={form.location}
                        onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                        placeholder="e.g. Bridgetown, Barbados"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        value={form.category}
                        onChange={e => setForm(prev => ({ ...prev, category: e.target.value as ActivityCategory }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                      >
                        {activityCategories.map(category => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duration (hours)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={form.duration_hours}
                        onChange={e => setForm(prev => ({ ...prev, duration_hours: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                        placeholder="e.g. 2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Price per person ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.price_per_person}
                        onChange={e => setForm(prev => ({ ...prev, price_per_person: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                        placeholder="e.g. 50.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Max capacity</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.max_capacity}
                        onChange={e => setForm(prev => ({ ...prev, max_capacity: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                        placeholder="e.g. 20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Activity Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => setImageFile(e.target.files?.[0] ?? null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    />
                  </div>
                </div>

                {message && (
                  <p className="mt-4 text-sm text-rose-600">{message}</p>
                )}

                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-6 py-2 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white font-semibold rounded-lg transition-all duration-300 disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create Activity"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-6 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {activities.length === 0 && !showCreate ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Activities Yet</h3>
                <p className="text-gray-600 mb-6">Start by adding your first activity listing.</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white font-semibold rounded-lg transition-all duration-300"
                >
                  Create Your First Activity
                </button>
              </div>
            ) : activities.length > 0 && (
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
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {activity.status !== "published" && (
                        <button
                          onClick={() => updateStatus(activity.id, "published")}
                          disabled={pendingId === activity.id}
                          className="px-3 py-2 text-sm font-medium text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-60"
                        >
                          Publish
                        </button>
                      )}
                      {activity.status === "published" && (
                        <button
                          onClick={() => updateStatus(activity.id, "draft")}
                          disabled={pendingId === activity.id}
                          className="px-3 py-2 text-sm font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-60"
                        >
                          Unpublish
                        </button>
                      )}
                      <Link
                        href={`/my-listings/manage/${activity.id}`}
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
