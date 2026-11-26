import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { ManageUsersClient } from "./ManageUsersClient";
import { Header } from "@/components/layout/header";
import { formatAdminTimestamp } from "@/lib/utils/formatting";

export default async function ManageUsersPage() {
  const supabase = await createClient();
  const role = await getUserRole(supabase);
  if (role === "guest") {
    redirect("/auth/login?redirect=/admin/users");
  }
  if (role !== "admin") {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white px-6 pt-32 text-[#193059]">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Access denied</h1>
            <p className="mt-2 text-sm text-slate-600">
              You need admin access to view this page.
            </p>
          </div>
        </div>
      </>
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
    <>
      <Header />
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

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
              <div className="mt-4">
                <table className="block w-full text-left text-sm lg:table">
                  <thead className="hidden text-xs uppercase text-slate-500 lg:table-header-group">
                    <tr>
                      <th className="py-2 pr-4">Vendor name</th>
                      <th className="py-2 pr-4">Owner user id</th>
                      <th className="py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody className="grid gap-4 lg:table-row-group">
                    {vendorRows.map(vendor => (
                      <tr key={vendor.id} className="grid min-w-0 gap-2 rounded-xl border border-slate-200 p-4 lg:table-row lg:rounded-none lg:border-0 lg:border-t lg:border-slate-100 lg:p-0">
                        <td className="block break-words font-medium lg:table-cell lg:py-3 lg:pr-4">{vendor.name}</td>
                        <td className="block break-all text-xs text-slate-500 lg:table-cell lg:py-3 lg:pr-4">
                          <span className="lg:hidden">Owner user id: </span>
                          {vendor.owner_user_id}
                        </td>
                        <td className="block text-xs text-slate-500 lg:table-cell lg:py-3">
                          <span className="lg:hidden">Created: </span>{formatAdminTimestamp(vendor.created_at)}
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
    </>
  );
}
