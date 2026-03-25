import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { Header } from "@/components/layout/header";
import { AccommodationEditClient } from "./AccommodationEditClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManageAccommodationEditPage({ params }: PageProps) {
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
            <h1 className="text-2xl font-semibold">Invalid accommodation</h1>
            <p className="mt-2 text-sm text-slate-600">
              The accommodation link is invalid.
            </p>
          </div>
        </div>
      </>
    );
  }
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role === "guest") {
    redirect(`/auth/login?redirect=/my-listings/manage/accommodations/${resolvedParams.id}`);
  }

  if (role !== "admin" && role !== "vendor") {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Access denied</h1>
            <p className="mt-2 text-sm text-slate-600">
              You need admin or vendor access to edit accommodations.
            </p>
          </div>
        </div>
      </>
    );
  }

  const { data: accommodation } = await supabase
    .from("accommodations")
    .select(
      "id, vendor_id, name, accommodation_type, bedroom_count, bed_count, bathroom_count, max_guest_capacity, price_min_usd, price_max_usd, check_in_time, check_out_time, suitable_for_children, wheelchair_accessible, smoking_allowed, pets_allowed, beach_access_or_view, transportation_provided, amenities, address, parish, transportation_notes, pickup_notes, image_url, status",
    )
    .eq("id", resolvedParams.id)
    .maybeSingle();

  if (!accommodation) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Accommodation not found</h1>
            <p className="mt-2 text-sm text-slate-600">
              We couldn&apos;t find that accommodation.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <AccommodationEditClient
        accommodationId={accommodation.id}
        vendorId={accommodation.vendor_id}
        initial={{
          name: accommodation.name,
          accommodation_type: accommodation.accommodation_type,
          bedroom_count: accommodation.bedroom_count,
          bed_count: accommodation.bed_count,
          bathroom_count: accommodation.bathroom_count,
          max_guest_capacity: accommodation.max_guest_capacity,
          price_min_usd: accommodation.price_min_usd,
          price_max_usd: accommodation.price_max_usd,
          check_in_time: accommodation.check_in_time,
          check_out_time: accommodation.check_out_time,
          suitable_for_children: accommodation.suitable_for_children,
          wheelchair_accessible: accommodation.wheelchair_accessible,
          smoking_allowed: accommodation.smoking_allowed,
          pets_allowed: accommodation.pets_allowed,
          beach_access_or_view: accommodation.beach_access_or_view,
          transportation_provided: accommodation.transportation_provided,
          amenities: accommodation.amenities,
          address: accommodation.address,
          parish: accommodation.parish,
          transportation_notes: accommodation.transportation_notes,
          pickup_notes: accommodation.pickup_notes,
          image_url: accommodation.image_url,
          status: accommodation.status,
        }}
      />
    </>
  );
}
