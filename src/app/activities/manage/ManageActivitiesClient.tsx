"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { activityCategories } from "@/lib/activities/constants";

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
  const [form, setForm] = useState({
    vendor_id: defaultVendorId,
    title: "",
    category: activityCategories[0]?.value ?? "water-sports",
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

    const payload = {
      vendor_id: form.vendor_id || fallbackVendorId,
      title: form.title.trim(),
      category: form.category,
    };

    if (!payload.vendor_id) {
      setMessage("Select a vendor first.");
      setCreating(false);
      return;
    }

    if (!payload.title) {
      setMessage("Title is required.");
      setCreating(false);
      return;
    }

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

      setForm(prev => ({ ...prev, title: "" }));
      setShowCreate(false);
      router.refresh();
    } catch (error: any) {
      setMessage(error?.message ?? "Failed to create activity.");
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
        <form onSubmit={createDraft} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            {canSelectVendor && (
              <div>
                <label className="block text-xs font-semibold text-slate-600">
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

            <div className={canSelectVendor ? "" : "md:col-span-2"}>
              <label className="block text-xs font-semibold text-slate-600">
                Title
              </label>
              <input
                value={form.title}
                onChange={event =>
                  setForm(prev => ({ ...prev, title: event.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="New activity"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Category
              </label>
              <select
                value={form.category}
                onChange={event =>
                  setForm(prev => ({ ...prev, category: event.target.value }))
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
          </div>

          {message && (
            <p className="mt-3 text-xs text-rose-600">{message}</p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-[#193059] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#407FC2] disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create draft"}
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
