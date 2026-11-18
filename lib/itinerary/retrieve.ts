import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import type { Activity } from "@/lib/activities/service";
import type { ItineraryActivityCandidate, ItineraryPrefs } from "./types";

export const MAX_ITINERARY_ACTIVITY_CANDIDATES = 30;

const ITINERARY_ACTIVITY_SELECT = [
  "id",
  "title",
  "category",
  "duration_hours",
  "price_per_person",
  "max_capacity",
  "location",
  "image_url",
] as const satisfies readonly (keyof Activity)[];

/** Retrieves bounded, published activity candidates; this does not check dated availability. */
export async function retrieveActivityCandidates(
  supabase: SupabaseClient<Database>,
  prefs: ItineraryPrefs,
): Promise<ItineraryActivityCandidate[]> {
  // Match plan validation's whole-cent budget, then divide before returning to USD.
  const budgetCents = Math.floor(prefs.budgetUsd * 100 + 1e-7);
  const maxPricePerPerson = Math.floor(budgetCents / prefs.groupSize) / 100;
  const { data, error } = await supabase
    .from("activities")
    .select(ITINERARY_ACTIVITY_SELECT.join(","))
    .eq("status", "published")
    .in("category", prefs.categories)
    .not("price_per_person", "is", null)
    .lte("price_per_person", maxPricePerPerson)
    .or(`max_capacity.is.null,max_capacity.gte.${prefs.groupSize}`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_ITINERARY_ACTIVITY_CANDIDATES);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ItineraryActivityCandidate[];
}
