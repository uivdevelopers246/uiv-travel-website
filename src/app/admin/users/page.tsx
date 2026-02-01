import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { ManageUsersClient } from "./ManageUsersClient";

export default async function ManageUsersPage() {
  const supabase = await createClient();
  const role = await getUserRole(supabase);
  if (role === "guest") {
    redirect("/auth/login?redirect=/admin/users");
  }
  if (role !== "admin") {
    return (
      <div className="min-h-screen bg-white px-6 pt-32 text-[#193059]">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-slate-600">
            You need admin access to view this page.
          </p>
        </div>
      </div>
    );
  }

  const [
    { data: profiles, error: profilesError },
    { data: vendors, error: vendorsError },
    { data: admins, error: adminsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("vendors")
      .select("id, name, owner_user_id, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("site_admins").select("user_id"),
  ]);

  const users = profiles ?? [];
  const vendorRows = vendors ?? [];
  const adminIds = admins?.map(admin => admin.user_id) ?? [];

  return (
    <div className="min-h-screen bg-white px-6 pt-32 pb-20 text-[#193059]">
      <div className="mx-auto max-w-5xl space-y-10">
        <div>
          <h1 className="text-3xl font-semibold">Manage users</h1>
          <p className="mt-2 text-sm text-slate-600">
            View all users and vendors. More tools will be added here soon.
          </p>
        </div>

        {profilesError && (
          <p className="text-sm text-red-600">
            Failed to load users: {profilesError.message}
          </p>
        )}
        {vendorsError && (
          <p className="text-sm text-red-600">
            Failed to load vendors: {vendorsError.message}
          </p>
        )}
        {adminsError && (
          <p className="text-sm text-red-600">
            Failed to load admin roles: {adminsError.message}
          </p>
        )}

        {!profilesError && !vendorsError && !adminsError && (
          <ManageUsersClient
            users={users}
            vendors={vendorRows}
            adminIds={adminIds}
          />
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Vendors</h2>
            <span className="text-xs text-slate-500">{vendorRows.length} total</span>
          </div>
          {vendorsError && (
            <p className="mt-3 text-sm text-red-600">
              Failed to load vendors: {vendorsError.message}
            </p>
          )}
          {!vendorsError && vendorRows.length === 0 && (
            <p className="mt-3 text-sm text-slate-600">No vendors found.</p>
          )}
          {vendorRows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Vendor name</th>
                    <th className="py-2 pr-4">Owner user id</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorRows.map(vendor => (
                    <tr key={vendor.id} className="border-t border-slate-100">
                      <td className="py-3 pr-4 font-medium">{vendor.name}</td>
                      <td className="py-3 pr-4 text-xs text-slate-500">
                        {vendor.owner_user_id}
                      </td>
                      <td className="py-3 text-xs text-slate-500">
                        {vendor.created_at
                          ? new Date(vendor.created_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
