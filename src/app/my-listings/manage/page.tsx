import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { Header } from "@/components/layout/header";
import { ManageActivitiesClient } from "./ManageActivitiesClient";

type ActivityStatus = "draft" | "published" | "archived";

export default async function ManageActivitiesPage() {
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role === "guest") {
    redirect("/auth/login?redirect=/my-listings/manage");
  }

  if (role !== "admin" && role !== "vendor") {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Access denied</h1>
            <p className="mt-2 text-sm text-slate-600">
              You need admin or vendor access to manage activities.
            </p>
          </div>
        </div>
      </>
    );
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  let activities: Array<{
    id: string;
    vendor_id: string;
    title: string;
    status: "draft" | "published" | "archived";
    created_at_display: string;
  }> = [];
  let vendorNames: Record<string, string> = {};
  let vendorOptions: Array<{ id: string; name: string }> = [];
  let defaultVendorId = "";
  let canSelectVendor = role === "admin";

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }).format(new Date(value))
      : "--";
  const normalizeStatus = (value: string | null): ActivityStatus =>
    value === "published" || value === "archived" ? value : "draft";

  if (role === "admin") {
    const [{ data: activityRows }, { data: vendorRows }] = await Promise.all([
      supabase
        .from("activities")
        .select("id, vendor_id, title, status, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("vendors").select("id, name"),
    ]);

    activities =
      activityRows?.map(activity => ({
        ...activity,
        status: normalizeStatus(activity.status ?? null),
        created_at_display: formatDate(activity.created_at ?? null),
      })) ?? [];
    vendorOptions = vendorRows ?? [];
    defaultVendorId = vendorOptions[0]?.id ?? "";
    vendorNames = vendorOptions.reduce<Record<string, string>>((acc, row) => {
      acc[row.id] = row.name;
      return acc;
    }, {});
  } else if (role === "vendor" && userId) {
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id, name")
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (!vendor) {
      return (
        <>
          <Header />
          <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
            <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-2xl font-semibold">Vendor access required</h1>
              <p className="mt-2 text-sm text-slate-600">
                You need a vendor account to manage activities.
              </p>
            </div>
          </div>
        </>
      );
    }

    const { data: activityRows } = await supabase
      .from("activities")
      .select("id, vendor_id, title, status, created_at")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false });

    activities =
      activityRows?.map(activity => ({
        ...activity,
        status: normalizeStatus(activity.status ?? null),
        created_at_display: formatDate(activity.created_at ?? null),
      })) ?? [];
    vendorNames = { [vendor.id]: vendor.name };
    vendorOptions = [vendor];
    defaultVendorId = vendor.id;
    canSelectVendor = false;
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
        <div className="mx-auto max-w-5xl space-y-8">
          <div>
            <h1 className="text-3xl font-semibold">Manage activities</h1>
            <p className="mt-2 text-sm text-slate-600">
              Draft and publish activities for your vendor.
            </p>
          </div>

          <ManageActivitiesClient
            activities={activities}
            vendorNames={vendorNames}
            vendors={vendorOptions}
            defaultVendorId={defaultVendorId}
            canSelectVendor={canSelectVendor}
          />
        </div>
      </div>
    </>
  );
}
