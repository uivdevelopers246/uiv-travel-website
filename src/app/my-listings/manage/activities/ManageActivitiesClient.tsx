"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { activityCategories } from "@/lib/activities/constants";
import { validateImageFile } from "@/lib/utils/image";

type ActivityCategory = (typeof activityCategories)[number]["value"];

export type Activity = {
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

type Props = {
  activities: Activity[];
  vendorId: string | null;
  onRefresh: () => Promise<void>;
};

export function ManageActivitiesClient({ activities, vendorId, onRefresh }: Props) {
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

      await onRefresh();
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
      // Validate file using shared utility
      const validationError = validateImageFile(imageFile);
      if (validationError) {
        setMessage(validationError);
        setCreating(false);
        return;
      }

      try {
        const supabase = createClient();
        const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "";

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
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Image upload failed.";
        setMessage(msg);
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
      await onRefresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to create activity";
      setMessage(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
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
                  href={`/my-listings/manage/activities/${activity.id}`}
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
  );
}
