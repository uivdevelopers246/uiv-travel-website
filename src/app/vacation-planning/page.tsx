import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { VacationPlanningClient } from "./VacationPlanningClient";

export default async function VacationPlanningPage() {
  const supabase = await createClient();
  
  const { data: activities } = await supabase
    .from("activities")
    .select(
      "id, title, description, location, category, duration_hours, price_per_person, max_capacity, image_url, vendors(name)",
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const { data: accommodations } = await supabase
    .from("accommodations")
    .select(
      "id, name, accommodation_type, bedroom_count, bed_count, bathroom_count, max_guest_capacity, price_min_usd, price_max_usd, amenities, address, parish, image_url, is_featured, vendors(name)",
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  return (
    <>
      <Header />
      <VacationPlanningClient 
        activities={activities ?? []} 
        accommodations={accommodations ?? []}
      />
    </>
  );
}
