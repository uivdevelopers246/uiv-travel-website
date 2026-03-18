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

  return (
    <>
      <Header />
      <VacationPlanningClient activities={activities ?? []} />
    </>
  );
}
