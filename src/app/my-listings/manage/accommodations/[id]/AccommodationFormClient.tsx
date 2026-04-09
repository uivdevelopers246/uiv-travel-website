"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { accommodationTypes, amenityOptions } from "@/lib/accommodations/constants";
import { applyCoordinatesToPayload } from "@/lib/utils/geo";
import {
  ALLOWED_IMAGE_EXTENSIONS_LABEL,
  DEFAULT_IMAGE_FALLBACK,
  formatFileSize,
  getSafeImageUrl,
  MAX_IMAGE_SIZE_LABEL,
  validateImageFile,
} from "@/lib/utils/image";
import { ImageManager, LocationPickerMap, type ManagedImage } from "@/components/shared";
import { MAX_ACCOMMODATION_IMAGES } from "@/lib/accommodations/types";

type AccommodationFormData = {
  name: string;
  accommodation_type: string;
  latitude?: number | null;
  longitude?: number | null;
  bedroom_count: number | null;
  bed_count: number | null;
  bathroom_count: number | null;
  max_guest_capacity: number | null;
  price_min_usd: number | null;
  price_max_usd: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  suitable_for_children: boolean;
  wheelchair_accessible: boolean;
  smoking_allowed: boolean;
  pets_allowed: boolean;
  beach_access_or_view: boolean;
  transportation_provided: boolean;
  amenities: string[];
  address: string | null;
  parish: string | null;
  transportation_notes: string | null;
  pickup_notes: string | null;
  image_url: string | null;
  status: string;
};

type Props = {
  mode: "create" | "edit";
  accommodationId?: string;
  vendorId: string;
  initial?: AccommodationFormData;
  existingImages?: ManagedImage[];
};

const defaultFormData: AccommodationFormData = {
  name: "",
  accommodation_type: accommodationTypes[0]?.value ?? "hotel",
  bedroom_count: null,
  bed_count: null,
  bathroom_count: null,
  max_guest_capacity: null,
  price_min_usd: null,
  price_max_usd: null,
  check_in_time: null,
  check_out_time: null,
  suitable_for_children: false,
  wheelchair_accessible: false,
  smoking_allowed: false,
  pets_allowed: false,
  beach_access_or_view: false,
  transportation_provided: false,
  amenities: [],
  address: null,
  parish: null,
  transportation_notes: null,
  pickup_notes: null,
  image_url: null,
  status: "draft",
};

function normalizeTimeInputValue(value: string | null | undefined) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const twentyFourHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }

    return "";
  }

  const meridiemMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!meridiemMatch) {
    return "";
  }

  const rawHours = Number(meridiemMatch[1]);
  const minutes = Number(meridiemMatch[2] ?? "0");
  const meridiem = meridiemMatch[3].toLowerCase();

  if (rawHours < 1 || rawHours > 12 || minutes < 0 || minutes > 59) {
    return "";
  }

  const hours =
    meridiem === "pm"
      ? rawHours === 12
        ? 12
        : rawHours + 12
      : rawHours === 12
        ? 0
        : rawHours;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export function AccommodationFormClient({
  mode,
  accommodationId,
  vendorId,
  initial = defaultFormData,
  existingImages = [],
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [coverImageError, setCoverImageError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<ManagedImage[]>(existingImages);
  const [coordinatesTouched, setCoordinatesTouched] = useState(false);
  const [form, setForm] = useState({
    name: initial.name ?? "",
    accommodation_type: initial.accommodation_type ?? accommodationTypes[0]?.value ?? "hotel",
    latitude: initial.latitude?.toString() ?? "",
    longitude: initial.longitude?.toString() ?? "",
    bedroom_count: initial.bedroom_count?.toString() ?? "",
    bed_count: initial.bed_count?.toString() ?? "",
    bathroom_count: initial.bathroom_count?.toString() ?? "",
    max_guest_capacity: initial.max_guest_capacity?.toString() ?? "",
    price_min_usd: initial.price_min_usd?.toString() ?? "",
    price_max_usd: initial.price_max_usd?.toString() ?? "",
    check_in_time: normalizeTimeInputValue(initial.check_in_time),
    check_out_time: normalizeTimeInputValue(initial.check_out_time),
    suitable_for_children: initial.suitable_for_children ?? false,
    wheelchair_accessible: initial.wheelchair_accessible ?? false,
    smoking_allowed: initial.smoking_allowed ?? false,
    pets_allowed: initial.pets_allowed ?? false,
    beach_access_or_view: initial.beach_access_or_view ?? false,
    transportation_provided: initial.transportation_provided ?? false,
    amenities: initial.amenities ?? [],
    address: initial.address ?? "",
    parish: initial.parish ?? "",
    transportation_notes: initial.transportation_notes ?? "",
    pickup_notes: initial.pickup_notes ?? "",
    image_url: initial.image_url ?? "",
    status: initial.status ?? "draft",
  });

  const isEdit = mode === "edit";

  const updateField = <K extends keyof typeof form>(field: K, value: typeof form[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateCoordinates = (value: { latitude: string; longitude: string }) => {
    setCoordinatesTouched(true);
    setForm(prev => ({ ...prev, ...value }));
  };

  const toggleAmenity = (amenity: string) => {
    setForm(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setCoverImageError(null);

    let imageUrl = form.image_url.trim() || null;

    if (imageFile) {
      // Validate file using shared utility
      const validationError = validateImageFile(imageFile);
      if (validationError) {
        setCoverImageError(validationError);
        setSaving(false);
        return;
      }

      try {
        const supabase = createClient();
        const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "";
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const objectPath = `${vendorId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("accommodation-images")
          .upload(objectPath, imageFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: imageFile.type || "image/jpeg",
          });

        if (uploadError) {
          setCoverImageError(uploadError.message);
          setSaving(false);
          return;
        }

        const { data } = supabase.storage
          .from("accommodation-images")
          .getPublicUrl(objectPath);

        imageUrl = data.publicUrl;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Image upload failed.";
        setCoverImageError(msg);
        setSaving(false);
        return;
      }
    }

    const payload = {
      name: form.name.trim(),
      accommodation_type: form.accommodation_type,
      bedroom_count: form.bedroom_count ? Number(form.bedroom_count) : null,
      bed_count: form.bed_count ? Number(form.bed_count) : null,
      bathroom_count: form.bathroom_count ? Number(form.bathroom_count) : null,
      max_guest_capacity: form.max_guest_capacity ? Number(form.max_guest_capacity) : null,
      price_min_usd: form.price_min_usd ? Number(form.price_min_usd) : null,
      price_max_usd: form.price_max_usd ? Number(form.price_max_usd) : null,
      check_in_time: form.check_in_time.trim() || null,
      check_out_time: form.check_out_time.trim() || null,
      suitable_for_children: form.suitable_for_children,
      wheelchair_accessible: form.wheelchair_accessible,
      smoking_allowed: form.smoking_allowed,
      pets_allowed: form.pets_allowed,
      beach_access_or_view: form.beach_access_or_view,
      transportation_provided: form.transportation_provided,
      amenities: form.amenities,
      address: form.address.trim() || null,
      parish: form.parish.trim() || null,
      transportation_notes: form.transportation_notes.trim() || null,
      pickup_notes: form.pickup_notes.trim() || null,
      image_url: imageUrl,
      status: form.status,
    } as {
      name: string;
      accommodation_type: string;
      bedroom_count: number | null;
      bed_count: number | null;
      bathroom_count: number | null;
      max_guest_capacity: number | null;
      price_min_usd: number | null;
      price_max_usd: number | null;
      check_in_time: string | null;
      check_out_time: string | null;
      suitable_for_children: boolean;
      wheelchair_accessible: boolean;
      smoking_allowed: boolean;
      pets_allowed: boolean;
      beach_access_or_view: boolean;
      transportation_provided: boolean;
      amenities: string[];
      address: string | null;
      parish: string | null;
      transportation_notes: string | null;
      pickup_notes: string | null;
      image_url: string | null;
      status: string;
      latitude?: number | null;
      longitude?: number | null;
    };

    if (!payload.name) {
      setMessage({ type: "error", text: "Name is required." });
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
      const endpoint = isEdit ? `/api/accommodations/${accommodationId}` : "/api/accommodations";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? `Failed to ${isEdit ? "update" : "create"} accommodation.` });
        setSaving(false);
        return;
      }

      if (isEdit) {
        setMessage({ type: "success", text: "Changes saved successfully." });
        setImageFile(null);
        router.refresh();
      } else {
        // For create, redirect to the edit page
        router.push(`/my-listings/manage/accommodations/${data.id}`);
        router.refresh();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : `Failed to ${isEdit ? "update" : "create"} accommodation.`;
      setMessage({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!accommodationId || !isEdit) return;

    if (!confirm("Are you sure you want to delete this accommodation? This action cannot be undone.")) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/accommodations/${accommodationId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: data?.error ?? "Failed to delete accommodation." });
        setSaving(false);
        return;
      }

      router.push("/my-listings");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to delete accommodation.";
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
                {isEdit ? "Edit Accommodation" : "Create New Accommodation"}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {isEdit
                  ? "Update the details for this accommodation listing."
                  : "Fill in the details to create a new accommodation listing."}
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
                  <label className="block text-sm font-medium text-slate-700">Name *</label>
                  <input
                    value={form.name}
                    onChange={e => updateField("name", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="e.g. Ocean View Villa"
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Type</label>
                    <select
                      value={form.accommodation_type}
                      onChange={e => updateField("accommodation_type", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    >
                      {accommodationTypes.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={form.status}
                      onChange={e => updateField("status", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {/* Location */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Location
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Address</label>
                  <input
                    value={form.address}
                    onChange={e => updateField("address", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="e.g. 123 Beach Road"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Parish</label>
                  <input
                    value={form.parish}
                    onChange={e => updateField("parish", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="e.g. St. James"
                  />
                </div>
              </div>
            </section>

            <LocationPickerMap
              title="Map Pin"
              description="Set the exact accommodation coordinates for the public map. Search by address or move the pin to fine-tune it."
              value={{
                latitude: form.latitude,
                longitude: form.longitude,
              }}
              onChange={updateCoordinates}
              onClear={() => updateCoordinates({ latitude: "", longitude: "" })}
              searchValue={form.address}
              onSearchValueChange={value => updateField("address", value)}
              onResolvedSearchValue={value => updateField("address", value)}
              searchLabel="Address"
            />

            {/* Room Details */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Room Details
              </h2>
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Bedrooms</label>
                  <input
                    type="number"
                    min="0"
                    value={form.bedroom_count}
                    onChange={e => updateField("bedroom_count", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Beds</label>
                  <input
                    type="number"
                    min="0"
                    value={form.bed_count}
                    onChange={e => updateField("bed_count", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Bathrooms</label>
                  <input
                    type="number"
                    min="0"
                    value={form.bathroom_count}
                    onChange={e => updateField("bathroom_count", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Max Guests</label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_guest_capacity}
                    onChange={e => updateField("max_guest_capacity", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="1"
                  />
                </div>
              </div>
            </section>

            {/* Pricing */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Pricing
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Min Price per Night ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price_min_usd}
                    onChange={e => updateField("price_min_usd", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Max Price per Night ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price_max_usd}
                    onChange={e => updateField("price_max_usd", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </section>

            {/* Check-in/Check-out */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Check-in / Check-out
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Check-in Time</label>
                  <input
                    type="time"
                    value={form.check_in_time}
                    onChange={e => updateField("check_in_time", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Check-out Time</label>
                  <input
                    type="time"
                    value={form.check_out_time}
                    onChange={e => updateField("check_out_time", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  />
                </div>
              </div>
            </section>

            {/* Amenities */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Amenities
              </h2>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                {amenityOptions.map(amenity => (
                  <label
                    key={amenity.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.amenities.includes(amenity.value)}
                      onChange={() => toggleAmenity(amenity.value)}
                      className="w-4 h-4 rounded border-slate-300 text-[#407FC2] focus:ring-[#407FC2]"
                    />
                    <span className="text-sm text-slate-700">{amenity.label}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Policies */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Policies & Features
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.suitable_for_children}
                    onChange={e => updateField("suitable_for_children", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#407FC2] focus:ring-[#407FC2]"
                  />
                  <span className="text-sm text-slate-700">Suitable for Children</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.wheelchair_accessible}
                    onChange={e => updateField("wheelchair_accessible", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#407FC2] focus:ring-[#407FC2]"
                  />
                  <span className="text-sm text-slate-700">Wheelchair Accessible</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.smoking_allowed}
                    onChange={e => updateField("smoking_allowed", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#407FC2] focus:ring-[#407FC2]"
                  />
                  <span className="text-sm text-slate-700">Smoking Allowed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pets_allowed}
                    onChange={e => updateField("pets_allowed", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#407FC2] focus:ring-[#407FC2]"
                  />
                  <span className="text-sm text-slate-700">Pets Allowed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.beach_access_or_view}
                    onChange={e => updateField("beach_access_or_view", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#407FC2] focus:ring-[#407FC2]"
                  />
                  <span className="text-sm text-slate-700">Beach Access/View</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.transportation_provided}
                    onChange={e => updateField("transportation_provided", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#407FC2] focus:ring-[#407FC2]"
                  />
                  <span className="text-sm text-slate-700">Transportation Provided</span>
                </label>
              </div>
            </section>

            {/* Transportation & Pickup Notes */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                Additional Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Transportation Notes</label>
                  <textarea
                    value={form.transportation_notes}
                    onChange={e => updateField("transportation_notes", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent min-h-[80px]"
                    placeholder="Information about transportation options..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Pickup Notes</label>
                  <textarea
                    value={form.pickup_notes}
                    onChange={e => updateField("pickup_notes", e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#407FC2] focus:border-transparent min-h-[80px]"
                    placeholder="Information about pickup/arrival..."
                  />
                </div>
              </div>
            </section>

            {/* Main Cover Image */}
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
                      alt="Current accommodation image"
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
                    onChange={e => {
                      setCoverImageError(null);
                      setImageFile(e.target.files?.[0] ?? null);
                    }}
                    className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Accepted formats: {ALLOWED_IMAGE_EXTENSIONS_LABEL}. Maximum file size: {MAX_IMAGE_SIZE_LABEL}.
                  </p>
                  {imageFile && (
                    <p className="mt-1 text-xs text-slate-500">
                      Selected: {imageFile.name} ({formatFileSize(imageFile.size)})
                    </p>
                  )}
                  {coverImageError && (
                    <p className="mt-2 text-sm text-rose-700">
                      {coverImageError}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Gallery Images - Only show for edit mode */}
            {isEdit && accommodationId && (
              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">
                  Gallery Images
                </h2>
                <p className="text-sm text-slate-600 mb-4">
                  Add additional photos to showcase your accommodation. These appear in the detail page gallery.
                </p>
                <ImageManager
                  images={galleryImages}
                  maxImages={MAX_ACCOMMODATION_IMAGES}
                  storageBucket="accommodation-images"
                  storagePath={vendorId}
                  apiEndpoint={`/api/accommodations/${accommodationId}/images`}
                  onImagesChange={setGalleryImages}
                  label="Gallery Images"
                />
              </section>
            )}

            {!isEdit && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> After creating the accommodation, you&apos;ll be able to add gallery images from the edit page.
                </p>
              </div>
            )}

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
                  Delete Accommodation
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
                  {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Accommodation"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
