import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AccommodationDetailClient } from "./AccommodationDetailClient";
import { withAccommodationBookablePrices } from "@/lib/accommodation-calendar/pricing";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccommodationDetailPage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const query = (await searchParams) ?? {};
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
      latitude,
      longitude,
      bedroom_count,
      bed_count,
      bathroom_count,
      max_guest_capacity,
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
  const [pricedAccommodation] = await withAccommodationBookablePrices(supabase, [accommodation]);

  // Keep the cover image available if the gallery cannot be loaded.
  let images: { id: string; image_url: string; alt_text: string | null; display_order: number }[] = [];
  try {
    const { data: imageData } = await supabase
      .from("accommodation_images")
      .select("id, image_url, alt_text, display_order")
      .eq("accommodation_id", id)
      .order("display_order", { ascending: true });
    images = imageData ?? [];
  } catch {
    // The cover image remains available without the gallery.
  }

  return (
    <>
      <Header />
      <AccommodationDetailClient 
        accommodation={pricedAccommodation}
        images={images} 
        initialSelection={{
          checkIn: typeof query.check_in === "string" ? query.check_in : "",
          checkOut: typeof query.check_out === "string" ? query.check_out : "",
          guests: typeof query.guests === "string" ? query.guests : "1",
        }}
      />
    </>
  );
}
