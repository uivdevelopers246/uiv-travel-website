import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { Header } from "@/components/layout/header";
import { ActivityEditClient } from "./ActivityEditClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManageActivityEditPage({ params }: PageProps) {
  const resolvedParams = await params;
  const isUuid =
    typeof resolvedParams.id === "string" &&
    /^[0-9a-fA-F-]{36}$/.test(resolvedParams.id);
  if (!isUuid) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Invalid activity</h1>
            <p className="mt-2 text-sm text-slate-600">
              The activity link is invalid.
            </p>
          </div>
        </div>
      </>
    );
  }
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role === "guest") {
    redirect(`/auth/login?redirect=/my-listings/manage/${resolvedParams.id}`);
  }

  if (role !== "admin" && role !== "vendor") {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Access denied</h1>
            <p className="mt-2 text-sm text-slate-600">
              You need admin or vendor access to edit activities.
            </p>
          </div>
        </div>
      </>
    );
  }

  const { data: activity } = await supabase
    .from("activities")
    .select(
      "id, vendor_id, title, description, location, category, duration_hours, price_per_person, max_capacity, image_url",
    )
    .eq("id", resolvedParams.id)
    .maybeSingle();

  if (!activity) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Activity not found</h1>
            <p className="mt-2 text-sm text-slate-600">
              We couldn&apos;t find that activity.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <ActivityEditClient
        activityId={activity.id}
        vendorId={activity.vendor_id}
        initial={{
          title: activity.title,
          description: activity.description,
          location: activity.location,
          category: activity.category,
          duration_hours: activity.duration_hours,
          price_per_person: activity.price_per_person,
          max_capacity: activity.max_capacity,
          image_url: activity.image_url,
        }}
      />
    </>
  );
}
