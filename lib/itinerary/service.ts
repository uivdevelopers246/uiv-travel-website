import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { assertAndRecordItineraryGeneration } from "./rateLimit";
import { retrieveActivityCandidates } from "./retrieve";
import type { ItineraryPrefs, ItineraryResult } from "./types";
import { generateItineraryPlan } from "./plan";
import { validateItineraryPlan } from "./validatePlan";

export class NoItineraryCandidatesError extends Error {
  constructor() {
    super("No activities match the itinerary preferences");
    this.name = "NoItineraryCandidatesError";
  }
}

export async function createItinerary(
  supabase: SupabaseClient<Database>,
  prefs: ItineraryPrefs,
): Promise<ItineraryResult> {
  const candidates = await retrieveActivityCandidates(supabase, prefs);
  if (candidates.length === 0) {
    throw new NoItineraryCandidatesError();
  }

  await assertAndRecordItineraryGeneration(supabase);
  const draft = await generateItineraryPlan(prefs, candidates);
  return validateItineraryPlan(draft, prefs, candidates);
}
