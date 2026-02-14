"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  const adminSet = new Set(adminIds);
  const vendorByOwner = new Map(vendors.map(vendor => [vendor.owner_user_id, vendor]));

  const runAction = async (action: ActionName, userId: string, vendorName?: string) => {
    setPendingId(userId);
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
        alert(message);
        return;
      }

      router.refresh();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Users</h2>
        <span className="text-xs text-slate-500">{users.length} total</span>
      </div>

      {users.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">No users found.</p>
      )}

      {users.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">Display name</th>
                <th className="py-2 pr-4">User id</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const isAdmin = adminSet.has(user.id);
                const vendor = vendorByOwner.get(user.id);
                const roleLabel = isAdmin ? "Admin" : vendor ? "Vendor" : "User";
                const loading = pendingId === user.id;

                return (
                  <tr key={user.id} className="border-t border-slate-100">
                    <td className="py-3 pr-4 font-medium">
                      {user.display_name ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-500">{user.id}</td>
                    <td className="py-3 pr-4 text-xs text-slate-500">{roleLabel}</td>
                    <td className="py-3 pr-4 text-xs text-slate-500">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
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
