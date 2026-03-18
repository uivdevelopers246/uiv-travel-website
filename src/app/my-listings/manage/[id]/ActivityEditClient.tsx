"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { activityCategories } from "@/lib/activities/constants";

type Props = {
  activityId: string;
  vendorId: string;
  initial: {
    title: string;
    description: string | null;
    location: string | null;
    category: string;
    duration_hours: number | null;
    price_per_person: number | null;
    max_capacity: number | null;
    image_url: string | null;
  };
};

export function ActivityEditClient({ activityId, vendorId, initial }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: initial.title ?? "",
    description: initial.description ?? "",
    location: initial.location ?? "",
    category: initial.category ?? activityCategories[0]?.value ?? "water-sports",
    duration_hours: initial.duration_hours?.toString() ?? "",
    price_per_person: initial.price_per_person?.toString() ?? "",
    max_capacity: initial.max_capacity?.toString() ?? "",
    image_url: initial.image_url ?? "",
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

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
          setSaving(false);
          return;
        }

        const { data } = supabase.storage
          .from("activity-images")
          .getPublicUrl(objectPath);

        imageUrl = data.publicUrl;
      } catch (error: any) {
        setMessage(error?.message ?? "Image upload failed.");
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
    };

    if (!payload.title) {
      setMessage("Title is required.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/activities/${activityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error ?? "Failed to update activity.");
        setSaving(false);
        return;
      }

      setMessage("Changes saved.");
      setImageFile(null);
      router.refresh();
    } catch (error: any) {
      setMessage(error?.message ?? "Failed to update activity.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Edit activity</h1>
            <p className="mt-2 text-sm text-slate-600">
              Update the details for this activity.
            </p>
          </div>
          <a
            href="/my-listings/manage"
            className="text-sm font-semibold text-[#193059] underline-offset-4 hover:underline"
          >
            Back to manage
          </a>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700">Title</label>
            <input
              value={form.title}
              onChange={event => updateField("title", event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
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
              className="mt-2 min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Location
            </label>
            <input
              value={form.location}
              onChange={event => updateField("location", event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Category
              </label>
              <select
                value={form.category}
                onChange={event => updateField("category", event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
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
                onChange={event => updateField("duration_hours", event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
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
                  updateField("price_per_person", event.target.value)
                }
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
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
                onChange={event => updateField("max_capacity", event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
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
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          {message && (
            <p className="text-sm text-slate-600">{message}</p>
          )}

          <div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#193059] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#407FC2] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
