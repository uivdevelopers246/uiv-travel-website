"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { activityCategories } from "@/lib/activities/constants";
import { applyCoordinatesToPayload } from "@/lib/utils/geo";
import {
  DEFAULT_IMAGE_FALLBACK,
  getSafeImageUrl,
  validateImageFile,
} from "@/lib/utils/image";
import { ImageManager, LocationPickerMap, type ManagedImage } from "@/components/shared";
import { MAX_ACTIVITY_IMAGES } from "@/lib/activities/types";

type ActivityFormData = {
  title: string;
  description: string | null;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category: string;
  duration_hours: number | null;
  price_per_person: number | null;
  max_capacity: number | null;
  image_url: string | null;
};

type Props = {
  mode: "create" | "edit";
  activityId?: string;
  vendorId: string;
  initial?: ActivityFormData;
  existingImages?: ManagedImage[];
};

const defaultFormData: ActivityFormData = {
  title: "",
  description: null,
  location: null,
  category: activityCategories[0]?.value ?? "water-sports",
  duration_hours: null,
  price_per_person: null,
  max_capacity: null,
  image_url: null,
};

export function ActivityFormClient({ 
  mode, 
  activityId, 
  vendorId, 
  initial = defaultFormData,
  existingImages = [],
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<ManagedImage[]>(existingImages);
  const [coordinatesTouched, setCoordinatesTouched] = useState(false);
  const [form, setForm] = useState({
    title: initial.title ?? "",
    description: initial.description ?? "",
    location: initial.location ?? "",
    latitude: initial.latitude?.toString() ?? "",
    longitude: initial.longitude?.toString() ?? "",
    category: initial.category ?? activityCategories[0]?.value ?? "water-sports",
    duration_hours: initial.duration_hours?.toString() ?? "",
    price_per_person: initial.price_per_person?.toString() ?? "",
    max_capacity: initial.max_capacity?.toString() ?? "",
    image_url: initial.image_url ?? "",
  });

  const isEdit = mode === "edit";

  const updateField = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateCoordinates = (value: { latitude: string; longitude: string }) => {
    setCoordinatesTouched(true);
    setForm(prev => ({ ...prev, ...value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    let imageUrl = form.image_url.trim() || null;

    if (imageFile) {
      // Validate file using shared utility
      const validationError = validateImageFile(imageFile);
      if (validationError) {
        setMessage({ type: "error", text: validationError });
        setSaving(false);
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
          setMessage({ type: "error", text: uploadError.message });
          setSaving(false);
          return;
        }

        const { data } = supabase.storage
          .from("activity-images")
          .getPublicUrl(objectPath);

        imageUrl = data.publicUrl;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Image upload failed.";
        setMessage({ type: "error", text: msg });
        setSaving(false);
        return;
      }
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      category: form.category,
      duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
      price_per_person: form.price_per_person ? Number(form.price_per_person) : null,
      max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
      image_url: imageUrl,
      status: "published",
    } as {
      title: string;
      description: string | null;
      location: string | null;
      category: string;
      duration_hours: number | null;
      price_per_person: number | null;
      max_capacity: number | null;
      image_url: string | null;
      status: string;
      latitude?: number | null;
      longitude?: number | null;
    };

    if (!payload.title) {
      setMessage({ type: "error", text: "Title is required." });
      setSaving(false);
      return;
    }

    if (coordinatesTouched) {
      const coordError = applyCoordinatesToPayload(form.latitude, form.longitude, payload);
      if (coordError) {
        setMessage({ type: "error", text: coordError });
        setSaving(false);
        return;
      }
    }

    try {
      const endpoint = isEdit ? `/api/activities/${activityId}` : "/api/activities";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? `Failed to ${isEdit ? "update" : "create"} activity.` });
        setSaving(false);
        return;
      }

      if (isEdit) {
        setMessage({ type: "success", text: "Changes saved successfully." });
        setImageFile(null);
        router.refresh();
      } else {
        // For create, redirect to the edit page
        router.push(`/my-listings/manage/activities/${data.id}`);
        router.refresh();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : `Failed to ${isEdit ? "update" : "create"} activity.`;
      setMessage({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activityId || !isEdit) return;
    
    if (!confirm("Are you sure you want to delete this activity? This action cannot be undone.")) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/activities/${activityId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: data?.error ?? "Failed to delete activity." });
        setSaving(false);
        return;
      }

      router.push("/my-listings");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to delete activity.";
      setMessage({ type: "error", text: msg });
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 pt-32 pb-16 text-[#193059]">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div>
              <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-playfair)' }}>
                {isEdit ? "Edit Activity" : "Create New Activity"}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {isEdit
                  ? "Update the details for this activity listing."
                  : "Fill in the details to create a new activity listing."}
              </p>
            </div>
            <a
              href="/my-listings"
              className="text-sm font-semibold text-[#407FC2] underline-offset-4 hover:underline"
            >
              Back to My Listings
            </a>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Basic Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Title *</label>
                  <input
                    value={form.title}
                    onChange={event => updateField("title", event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="e.g. Sunset Snorkeling Adventure"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={event => updateField("description", event.target.value)}
                    className="mt-2 min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="Describe what guests will experience..."
                  />
                </div>
              </div>
            </section>

            {/* Location & Category */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Location & Category
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Location
                  </label>
                  <input
                    value={form.location}
                    onChange={event => updateField("location", event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="e.g. Bridgetown, Barbados"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={event => updateField("category", event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  >
                    {activityCategories.map(category => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <LocationPickerMap
              title="Map Pin"
              description="Set the exact activity coordinates that should appear on the public Barbados map. Search by place or move the pin to fine-tune it."
              value={{
                latitude: form.latitude,
                longitude: form.longitude,
              }}
              onChange={updateCoordinates}
              onClear={() => updateCoordinates({ latitude: "", longitude: "" })}
              searchValue={form.location}
              onSearchValueChange={value => updateField("location", value)}
              onResolvedSearchValue={value => updateField("location", value)}
              searchLabel="Approximate address or area"
            />

            {/* Pricing & Capacity */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Pricing & Capacity
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Duration (hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={form.duration_hours}
                    onChange={event => updateField("duration_hours", event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="e.g. 2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Price per Person ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price_per_person}
                    onChange={event => updateField("price_per_person", event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="e.g. 50.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Max Capacity
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.max_capacity}
                    onChange={event => updateField("max_capacity", event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="e.g. 20"
                  />
                </div>
              </div>
            </section>

            {/* Cover Image */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Cover Image
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                This is the main image that appears in search results and cards.
              </p>
              <div className="space-y-4">
                {form.image_url && (
                  <div className="w-48 h-32 rounded-lg overflow-hidden bg-slate-100">
                    <img
                      src={getSafeImageUrl(form.image_url, DEFAULT_IMAGE_FALLBACK)}
                      alt="Current activity image"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {form.image_url ? "Upload New Cover Image" : "Upload Cover Image"}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={event => setImageFile(event.target.files?.[0] ?? null)}
                    className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  />
                  {imageFile && (
                    <p className="mt-1 text-xs text-slate-500">
                      Selected: {imageFile.name}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Gallery Images
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Add additional photos to showcase your activity. These appear in the detail page gallery.
              </p>
              {isEdit && activityId ? (
                <ImageManager
                  images={galleryImages}
                  maxImages={MAX_ACTIVITY_IMAGES}
                  storageBucket="activity-images"
                  storagePath={vendorId}
                  apiEndpoint={`/api/activities/${activityId}/images`}
                  onImagesChange={setGalleryImages}
                  onError={(error) => setMessage({ type: "error", text: error })}
                  label="Gallery Images"
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  Save the activity once to enable gallery image uploads.
                </div>
              )}
            </section>

            {/* Messages */}
            {message && (
              <div className={`p-4 rounded-lg ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {message.text}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t">
              {isEdit ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-rose-600 border border-rose-300 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-60"
                >
                  Delete Activity
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-3">
                <a
                  href="/my-listings"
                  className="px-6 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </a>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white text-sm font-semibold rounded-lg transition-all duration-300 disabled:opacity-60"
                >
                  {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Activity"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
