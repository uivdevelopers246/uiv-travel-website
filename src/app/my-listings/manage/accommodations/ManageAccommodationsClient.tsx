"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { accommodationTypes } from "@/lib/accommodations/constants";
import { validateImageFile } from "@/lib/utils/image";

type AccommodationType = (typeof accommodationTypes)[number]["value"];

export type Accommodation = {
  id: string;
  name: string;
  accommodation_type: string;
  status: string;
  bedroom_count: number | null;
  bathroom_count: number | null;
  max_guest_capacity: number | null;
  price_min_usd: number | null;
  price_max_usd: number | null;
  address: string | null;
  parish: string | null;
  image_url: string | null;
  created_at: string;
  vendor_id: string;
};

type Props = {
  accommodations: Accommodation[];
  vendorId: string | null;
  onRefresh: () => Promise<void>;
};

export function ManageAccommodationsClient({ accommodations, vendorId, onRefresh }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string;
    accommodation_type: AccommodationType;
    address: string;
    parish: string;
    bedroom_count: string;
    bathroom_count: string;
    max_guest_capacity: string;
    price_min_usd: string;
    price_max_usd: string;
    image_url: string;
  }>({
    name: "",
    accommodation_type: accommodationTypes[0]?.value ?? "hotel",
    address: "",
    parish: "",
    bedroom_count: "",
    bathroom_count: "",
    max_guest_capacity: "",
    price_min_usd: "",
    price_max_usd: "",
    image_url: "",
  });

  const updateStatus = async (id: string, status: "draft" | "published") => {
    setPendingId(id);
    try {
      const res = await fetch(`/api/accommodations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error ?? "Failed to update accommodation status.");
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

    if (!form.name.trim()) {
      setMessage("Name is required.");
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
          .from("accommodation-images")
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
          .from("accommodation-images")
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
      name: form.name.trim(),
      accommodation_type: form.accommodation_type,
      address: form.address.trim() || null,
      parish: form.parish.trim() || null,
      bedroom_count: form.bedroom_count ? Number(form.bedroom_count) : null,
      bathroom_count: form.bathroom_count ? Number(form.bathroom_count) : null,
      max_guest_capacity: form.max_guest_capacity ? Number(form.max_guest_capacity) : null,
      price_min_usd: form.price_min_usd ? Number(form.price_min_usd) : null,
      price_max_usd: form.price_max_usd ? Number(form.price_max_usd) : null,
      image_url: imageUrl,
    };

    try {
      const res = await fetch("/api/accommodations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error ?? "Failed to create accommodation.");
        setCreating(false);
        return;
      }

      setForm({
        name: "",
        accommodation_type: accommodationTypes[0]?.value ?? "hotel",
        address: "",
        parish: "",
        bedroom_count: "",
        bathroom_count: "",
        max_guest_capacity: "",
        price_min_usd: "",
        price_max_usd: "",
        image_url: "",
      });
      setImageFile(null);
      setShowCreate(false);
      await onRefresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to create accommodation";
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
          {showCreate ? "Cancel" : "Add New Accommodation"}
        </button>
      </div>

      {/* Create Accommodation Form */}
      {showCreate && (
        <form onSubmit={createDraft} className="mb-8 bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Accommodation</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                placeholder="Enter accommodation name"
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  value={form.address}
                  onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  placeholder="e.g. 123 Beach Road"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parish</label>
                <input
                  value={form.parish}
                  onChange={e => setForm(prev => ({ ...prev, parish: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  placeholder="e.g. St. James"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.accommodation_type}
                onChange={e => setForm(prev => ({ ...prev, accommodation_type: e.target.value as AccommodationType }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
              >
                {accommodationTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.bedroom_count}
                  onChange={e => setForm(prev => ({ ...prev, bedroom_count: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  placeholder="e.g. 2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.bathroom_count}
                  onChange={e => setForm(prev => ({ ...prev, bathroom_count: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  placeholder="e.g. 2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.max_guest_capacity}
                  onChange={e => setForm(prev => ({ ...prev, max_guest_capacity: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  placeholder="e.g. 4"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Price per Night ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price_min_usd}
                  onChange={e => setForm(prev => ({ ...prev, price_min_usd: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  placeholder="e.g. 100.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Price per Night ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price_max_usd}
                  onChange={e => setForm(prev => ({ ...prev, price_max_usd: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#407FC2] focus:border-transparent"
                  placeholder="e.g. 200.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Accommodation Image</label>
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
              {creating ? "Creating..." : "Create Accommodation"}
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

      {accommodations.length === 0 && !showCreate ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Accommodations Yet</h3>
          <p className="text-gray-600 mb-6">Start by adding your first accommodation listing.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white font-semibold rounded-lg transition-all duration-300"
          >
            Create Your First Accommodation
          </button>
        </div>
      ) : accommodations.length > 0 && (
        <div className="grid gap-4">
          {accommodations.map((accommodation) => {
            const typeLabel = accommodationTypes.find(t => t.value === accommodation.accommodation_type)?.label || accommodation.accommodation_type;
            return (
              <div
                key={accommodation.id}
                className="bg-white rounded-lg shadow-sm p-6 flex items-center gap-6"
              >
                {/* Image */}
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  <img
                    src={accommodation.image_url ?? "/images/hero/ScenicHill.JPG"}
                    alt={accommodation.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">{accommodation.name}</h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      accommodation.status === "published" 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {accommodation.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{accommodation.parish ?? accommodation.address ?? "No location set"}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {accommodation.price_min_usd ? `$${accommodation.price_min_usd}${accommodation.price_max_usd && accommodation.price_max_usd !== accommodation.price_min_usd ? `-${accommodation.price_max_usd}` : ""}/night` : "Price not set"} • {typeLabel} • {accommodation.bedroom_count ?? 0} bed{(accommodation.bedroom_count ?? 0) !== 1 ? "s" : ""} • {accommodation.max_guest_capacity ?? 0} guests
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {accommodation.status !== "published" && (
                    <button
                      onClick={() => updateStatus(accommodation.id, "published")}
                      disabled={pendingId === accommodation.id}
                      className="px-3 py-2 text-sm font-medium text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-60"
                    >
                      Publish
                    </button>
                  )}
                  {accommodation.status === "published" && (
                    <button
                      onClick={() => updateStatus(accommodation.id, "draft")}
                      disabled={pendingId === accommodation.id}
                      className="px-3 py-2 text-sm font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-60"
                    >
                      Unpublish
                    </button>
                  )}
                  <Link
                    href={`/my-listings/manage/accommodations/${accommodation.id}`}
                    className="px-4 py-2 text-sm font-medium text-[#407FC2] border border-[#407FC2] rounded-lg hover:bg-[#407FC2] hover:text-white transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
