import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { AccommodationFormClient } from "./AccommodationFormClient";
import type { AccommodationImage } from "@/lib/accommodations/types";
import { ManageListingStatePage } from "../../_shared/ManageListingStatePage";
import {
  getCurrentVendorIdForManage,
  isValidUuid,
  requireManageListingAccess,
} from "../../_shared/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManageAccommodationEditPage({ params }: PageProps) {
  const resolvedParams = await params;
  if (!isValidUuid(resolvedParams.id)) {
    return (
      <ManageListingStatePage
        title="Invalid accommodation"
        message="The accommodation link is invalid."
      />
    );
  }

  const supabase = await createClient();
  const redirectTo = `/my-listings/manage/accommodations/${resolvedParams.id}`;
  const role = await requireManageListingAccess(supabase, redirectTo);

  if (!role) {
    return (
      <ManageListingStatePage
        title="Access denied"
        message="You need admin or vendor access to edit accommodations."
      />
    );
  }

  const vendorId =
    role === "vendor"
      ? await getCurrentVendorIdForManage(supabase, redirectTo)
      : null;

  if (role === "vendor" && !vendorId) {
    return (
      <ManageListingStatePage
        title="Vendor profile required"
        message="You need a vendor profile to manage accommodations."
      />
    );
  }

  let accommodationQuery = (supabase as any)
    .from("accommodations")
    .select(
      "id, vendor_id, name, accommodation_type, latitude, longitude, bedroom_count, bed_count, bathroom_count, max_guest_capacity, price_min_usd, price_max_usd, check_in_time, check_out_time, suitable_for_children, wheelchair_accessible, smoking_allowed, pets_allowed, beach_access_or_view, transportation_provided, amenities, address, parish, transportation_notes, pickup_notes, image_url, status",
    )
    .eq("id", resolvedParams.id);

  if (vendorId) {
    accommodationQuery = accommodationQuery.eq("vendor_id", vendorId);
  }

  const { data: accommodation } = await accommodationQuery.maybeSingle();

  if (!accommodation) {
    return (
      <ManageListingStatePage
        title="Accommodation not found"
        message="We couldn&apos;t find that accommodation."
      />
    );
  }

  // Fetch accommodation images
  let existingImages: AccommodationImage[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: imageData } = await (supabase as any)
      .from("accommodation_images")
      .select("id, image_url, alt_text, display_order")
      .eq("accommodation_id", resolvedParams.id)
      .order("display_order", { ascending: true });
    existingImages = (imageData as AccommodationImage[]) ?? [];
  } catch {
    // Table may not exist yet
  }

  return (
    <>
      <Header />
      <AccommodationFormClient
        mode="edit"
        accommodationId={accommodation.id}
        vendorId={accommodation.vendor_id}
        initial={{
          name: accommodation.name,
          accommodation_type: accommodation.accommodation_type,
          latitude: accommodation.latitude,
          longitude: accommodation.longitude,
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
        existingImages={existingImages}
      />
    </>
  );
}
