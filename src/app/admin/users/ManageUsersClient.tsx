"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatAdminTimestamp } from "@/lib/utils/formatting";

type UserRow = {
  id: string;
  display_name: string | null;
  created_at: string | null;
};

type VendorRow = {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string | null;
};

type Props = {
  users: UserRow[];
  vendors: VendorRow[];
  adminIds: string[];
};

type ActionName = "make_admin" | "remove_admin" | "make_vendor" | "remove_vendor";

export function ManageUsersClient({ users, vendors, adminIds }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adminSet = new Set(adminIds);
  const vendorByOwner = new Map(vendors.map(vendor => [vendor.owner_user_id, vendor]));

  const runAction = async (action: ActionName, userId: string, vendorName?: string) => {
    setPendingId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          user_id: userId,
          vendor_name: vendorName,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.error ?? "Request failed";
        setError(message);
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to update this user. Please try again.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Users</h2>
        <span className="text-xs text-slate-500">{users.length} total</span>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      {users.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">No users found.</p>
      )}

      {users.length > 0 && (
        <div className="mt-4">
          <table className="block w-full text-left text-sm lg:table">
            <thead className="hidden text-xs uppercase text-slate-500 lg:table-header-group">
              <tr>
                <th className="py-2 pr-4">Display name</th>
                <th className="py-2 pr-4">User id</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="grid gap-4 lg:table-row-group">
              {users.map(user => {
                const isAdmin = adminSet.has(user.id);
                const vendor = vendorByOwner.get(user.id);
                const roleLabel = isAdmin ? "Admin" : vendor ? "Vendor" : "User";
                const loading = pendingId === user.id;

                return (
                  <tr key={user.id} className="grid min-w-0 gap-2 rounded-xl border border-slate-200 p-4 lg:table-row lg:rounded-none lg:border-0 lg:border-t lg:border-slate-100 lg:p-0">
                    <td className="block break-words font-medium lg:table-cell lg:py-3 lg:pr-4">
                      {user.display_name ?? "—"}
                    </td>
                    <td className="block break-all text-xs text-slate-500 lg:table-cell lg:py-3 lg:pr-4"><span className="lg:hidden">User id: </span>{user.id}</td>
                    <td className="block text-xs text-slate-500 lg:table-cell lg:py-3 lg:pr-4"><span className="lg:hidden">Role: </span>{roleLabel}</td>
                    <td className="block text-xs text-slate-500 lg:table-cell lg:py-3 lg:pr-4">
                      <span className="lg:hidden">Created: </span>{formatAdminTimestamp(user.created_at)}
                    </td>
                    <td className="block pt-2 lg:table-cell lg:py-3 lg:text-right">
                      <div className="inline-flex flex-wrap items-center gap-2 lg:justify-end">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            runAction(
                              isAdmin ? "remove_admin" : "make_admin",
                              user.id,
                            )
                          }
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isAdmin ? "Remove admin" : "Make admin"}
                        </button>

                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            if (vendor) {
                              runAction("remove_vendor", user.id);
                              return;
                            }

                            const defaultName =
                              user.display_name?.trim() || "Vendor";
                            const name = window.prompt(
                              "Vendor name",
                              defaultName,
                            );
                            if (!name) return;
                            runAction("make_vendor", user.id, name);
                          }}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {vendor ? "Remove vendor" : "Make vendor"}
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
