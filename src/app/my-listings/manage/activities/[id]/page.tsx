import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ActivityFormClient } from "./ActivityFormClient";
import type { ActivityImage } from "@/lib/activities/types";
import { ManageListingStatePage } from "../../_shared/ManageListingStatePage";
import {
  getCurrentVendorIdForManage,
  isValidUuid,
  requireManageListingAccess,
} from "../../_shared/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManageActivityEditPage({ params }: PageProps) {
  const resolvedParams = await params;
  if (!isValidUuid(resolvedParams.id)) {
    return (
      <ManageListingStatePage
        title="Invalid activity"
        message="The activity link is invalid."
      />
    );
  }

  const supabase = await createClient();
  const redirectTo = `/my-listings/manage/activities/${resolvedParams.id}`;
  const role = await requireManageListingAccess(supabase, redirectTo);

  if (!role) {
    return (
      <ManageListingStatePage
        title="Access denied"
        message="You need admin or vendor access to edit activities."
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
        message="You need a vendor profile to manage activities."
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activityQuery = (supabase as any)
    .from("activities")
    .select(
      "id, vendor_id, title, description, location, latitude, longitude, category, duration_hours, price_per_person, max_capacity, image_url, status",
    )
    .eq("id", resolvedParams.id);

  if (vendorId) {
    activityQuery = activityQuery.eq("vendor_id", vendorId);
  }

  const { data: activity } = await activityQuery.maybeSingle();

  if (!activity) {
    return (
      <ManageListingStatePage
        title="Activity not found"
        message="We couldn&apos;t find that activity."
      />
    );
  }

  // Fetch activity images
  let existingImages: ActivityImage[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: imageData } = await (supabase as any)
      .from("activity_images")
      .select("id, image_url, alt_text, display_order")
      .eq("activity_id", resolvedParams.id)
      .order("display_order", { ascending: true });
    existingImages = (imageData as ActivityImage[]) ?? [];
  } catch {
    // Table may not exist yet
  }

  return (
    <>
      <Header />
      <ActivityFormClient
        mode="edit"
        activityId={activity.id}
        vendorId={activity.vendor_id}
        initial={{
          title: activity.title,
          description: activity.description,
          location: activity.location,
          latitude: activity.latitude,
          longitude: activity.longitude,
          category: activity.category,
          duration_hours: activity.duration_hours,
          price_per_person: activity.price_per_person,
          max_capacity: activity.max_capacity,
          image_url: activity.image_url,
        }}
        existingImages={existingImages}
      />
    </>
  );
}
