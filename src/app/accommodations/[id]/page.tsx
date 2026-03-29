import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AccommodationDetailClient } from "./AccommodationDetailClient";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AccommodationDetailPage({ params }: Props) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  // Validate UUID format
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(id);
  if (!isUuid) {
    notFound();
  }

  const supabase = await createClient();

  // Fetch accommodation with vendor info
  const { data: accommodation, error } = await supabase
    .from("accommodations")
    .select(
      `
      id,
      name,
      accommodation_type,
      bedroom_count,
      bed_count,
      bathroom_count,
      max_guest_capacity,
      price_min_usd,
      price_max_usd,
      check_in_time,
      check_out_time,
      suitable_for_children,
      wheelchair_accessible,
      smoking_allowed,
      pets_allowed,
      beach_access_or_view,
      transportation_provided,
      amenities,
      address,
      parish,
      transportation_notes,
      pickup_notes,
      image_url,
      is_featured,
      vendors(id, name, contact_email, business_phone)
    `
    )
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !accommodation) {
    notFound();
  }

  // Fetch accommodation images (once migration is applied)
  // For now, this will return empty array if table doesn't exist
  let images: { id: string; image_url: string; alt_text: string | null; display_order: number }[] = [];
  try {
    const { data: imageData } = await supabase
      .from("accommodation_images" as "accommodations") // Type assertion until types are regenerated
      .select("id, image_url, alt_text, display_order")
      .eq("accommodation_id" as "id", id)
      .order("display_order", { ascending: true });
    images = (imageData as unknown as typeof images) ?? [];
  } catch {
    // Table may not exist yet
  }

  return (
    <>
      <Header />
      <AccommodationDetailClient 
        accommodation={accommodation} 
        images={images} 
      />
    </>
  );
}
