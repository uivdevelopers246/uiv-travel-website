import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import type { ActivityDisplay } from "@/lib/activities/types";
import { VacationPlanningClient } from "./VacationPlanningClient";

export default async function VacationPlanningPage() {
  const supabase = await createClient();
  
  const { data: activities } = await (supabase as any)
    .from("activities")
    .select(
      "id, title, description, location, latitude, longitude, category, duration_hours, price_per_person, max_capacity, image_url, vendors(name)",
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const { data: accommodations } = await (supabase as any)
    .from("accommodations")
    .select(
      "id, name, accommodation_type, latitude, longitude, bedroom_count, bed_count, bathroom_count, max_guest_capacity, price_min_usd, price_max_usd, amenities, address, parish, image_url, is_featured, vendors(name)",
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  return (
    <>
      <Header />
      <VacationPlanningClient 
        activities={(activities ?? []) as ActivityDisplay[]} 
        accommodations={(accommodations ?? []) as AccommodationDisplay[]}
      />
    </>
  );
}
