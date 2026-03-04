"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { activityCategories } from "@/lib/activities/constants";

type ActivityCategory = (typeof activityCategories)[number]["value"];

type ActivityRow = {
  id: string;
  vendor_id: string;
  title: string;
  status: "draft" | "published" | "archived";
  created_at_display: string;
};

type Props = {
  activities: ActivityRow[];
  vendorNames: Record<string, string>;
  vendors: { id: string; name: string }[];
  defaultVendorId: string;
  canSelectVendor: boolean;
};

type StatusAction = "draft" | "published";

export function ManageActivitiesClient({
  activities,
  vendorNames,
  vendors,
  defaultVendorId,
  canSelectVendor,
}: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [form, setForm] = useState<{
    vendor_id: string;
    title: string;
    description: string;
    location: string;
    category: ActivityCategory;
    duration_hours: string;
    price_per_person: string;
    max_capacity: string;
    image_url: string;
  }>({
    vendor_id: defaultVendorId,
    title: "",
    description: "",
    location: "",
    category: activityCategories[0]?.value ?? "water-sports",
    duration_hours: "",
    price_per_person: "",
    max_capacity: "",
    image_url: "",
  });

  const fallbackVendorId = vendors[0]?.id ?? "";

  const updateStatus = async (id: string, status: StatusAction) => {
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

      router.refresh();
    } finally {
      setPendingId(null);
    }
  };

  const createDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setMessage(null);

    const vendorId = form.vendor_id || fallbackVendorId;

    if (!vendorId) {
      setMessage("Select a vendor first.");
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
        const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
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
        vendor_id: defaultVendorId,
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
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create activity";
      setMessage(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Activities</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{activities.length} total</span>
          <button
            type="button"
            onClick={() => setShowCreate(prev => !prev)}
            disabled={vendors.length === 0}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Create draft activity"
            title={vendors.length === 0 ? "Create a vendor first" : "Create draft"}
          >
            +
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={createDraft} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Create new activity</h3>
          
          <div className="space-y-5">
            {canSelectVendor && (
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Vendor
                </label>
                <select
                  value={form.vendor_id}
                  onChange={event =>
                    setForm(prev => ({ ...prev, vendor_id: event.target.value }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Title</label>
              <input
                value={form.title}
                onChange={event =>
                  setForm(prev => ({ ...prev, title: event.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="Enter activity title"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={event =>
                  setForm(prev => ({ ...prev, description: event.target.value }))
                }
                className="mt-2 min-h-[120px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="Describe the activity..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Location
              </label>
              <input
                value={form.location}
                onChange={event =>
                  setForm(prev => ({ ...prev, location: event.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="e.g. Bridgetown, Barbados"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={event =>
                    setForm(prev => ({
                      ...prev,
                      category: event.target.value as ActivityCategory,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {activityCategories.map(category => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Duration (hours)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.duration_hours}
                  onChange={event =>
                    setForm(prev => ({ ...prev, duration_hours: event.target.value }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="e.g. 2"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Price per person
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price_per_person}
                  onChange={event =>
                    setForm(prev => ({ ...prev, price_per_person: event.target.value }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="e.g. 50.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Max capacity
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.max_capacity}
                  onChange={event =>
                    setForm(prev => ({ ...prev, max_capacity: event.target.value }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="e.g. 20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Activity image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={event => setImageFile(event.target.files?.[0] ?? null)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          {message && (
            <p className="mt-4 text-sm text-rose-600">{message}</p>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-[#193059] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#407FC2] disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create activity"}
            </button>
          </div>
        </form>
      )}

      {activities.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">No activities yet.</p>
      )}

      {activities.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(activity => {
                const statusLabel =
                  activity.status.charAt(0).toUpperCase() +
                  activity.status.slice(1);
                const statusColor =
                  activity.status === "published"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700";
                const loading = pendingId === activity.id;

                return (
                  <tr key={activity.id} className="border-t border-slate-100">
                    <td className="py-3 pr-4 font-medium">{activity.title}</td>
                    <td className="py-3 pr-4 text-xs text-slate-500">
                      {vendorNames[activity.vendor_id] ?? activity.vendor_id}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor}`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-500">
                      {activity.created_at_display}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={loading || activity.status === "published"}
                          onClick={() => updateStatus(activity.id, "published")}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Publish
                        </button>
                        <a
                          href={`/activities/manage/${activity.id}`}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Edit
                        </a>
                        <button
                          type="button"
                          disabled={loading || activity.status === "draft"}
                          onClick={() => updateStatus(activity.id, "draft")}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Move to draft
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
