import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ActivityFormClient } from "./ActivityFormClient";
import type { ActivityImage } from "@/lib/activities/types";
import { ManageListingStatePage } from "../../_shared/ManageListingStatePage";
import { getManagedActivityPageData } from "./managed-activity";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManageActivityEditPage({ params }: PageProps) {
  const resolvedParams = await params;
  const redirectTo = `/my-listings/manage/activities/${resolvedParams.id}`;
  const pageData = await getManagedActivityPageData(
    resolvedParams.id,
    redirectTo,
  );

  if ("error" in pageData) {
    return (
      <ManageListingStatePage
        title={pageData.error.title}
        message={pageData.error.message}
      />
    );
  }

  const { activity } = pageData;
  const supabase = await createClient();

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
