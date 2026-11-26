import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ActivityDetailClient } from "./ActivityDetailClient";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ActivityDetailPage({ params }: Props) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  // Validate UUID format
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(id);
  if (!isUuid) {
    notFound();
  }

  const supabase = await createClient();

  // Fetch activity with vendor info
  const { data: activity, error } = await supabase
    .from("activities")
    .select(
      `
      id,
      title,
      description,
      location,
      latitude,
      longitude,
      category,
      duration_hours,
      price_per_person,
      max_capacity,
      rating,
      image_url,
      is_featured,
      vendors(id, name, contact_email, business_phone)
    `
    )
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !activity) {
    notFound();
  }

  // Keep the cover image available if the gallery cannot be loaded.
  let images: { id: string; image_url: string; alt_text: string | null; display_order: number }[] = [];
  try {
    const { data: imageData } = await supabase
      .from("activity_images")
      .select("id, image_url, alt_text, display_order")
      .eq("activity_id", id)
      .order("display_order", { ascending: true });
    images = imageData ?? [];
  } catch {
    // The cover image remains available without the gallery.
  }

  return (
    <>
      <Header />
      <ActivityDetailClient 
        activity={activity}
        images={images}
      />
    </>
  );
}
