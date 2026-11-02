import type { ItineraryRequest, CompleteItineraryResult } from "./types";
import { retrieveStayCandidates } from "./accommodations";
import { InvalidItineraryPlanError } from "./validatePlan";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { assertAndRecordItineraryGeneration } from "./rateLimit";
import { retrieveActivityCandidates } from "./retrieve";
import type { ItineraryPrefs } from "./types";
import { generateItineraryPlan } from "./plan";
import { validateItineraryPlan } from "./validatePlan";

export class NoItineraryCandidatesError extends Error {
  constructor() {
    super("No activities match the itinerary preferences");
    this.name = "NoItineraryCandidatesError";
  }
}

export async function createCompleteItinerary(supabase: SupabaseClient<Database>, request: ItineraryRequest): Promise<CompleteItineraryResult> {
  const prefs: ItineraryPrefs = { tripStartDate: request.tripStartDate, tripEndDate: request.tripEndDate, groupSize: request.groupSize, ...request.activities };
  const candidates = await retrieveActivityCandidates(supabase, prefs);
  if (!candidates.length) throw new NoItineraryCandidatesError();
  const stays = request.mode === "activities_and_accommodation" ? await retrieveStayCandidates(supabase, request.accommodation, request.groupSize) : [];
  if (request.mode === "activities_and_accommodation" && !stays.length) throw new NoAccommodationCandidatesError();
  await assertAndRecordItineraryGeneration(supabase);
  const draft = await generateItineraryPlan(prefs, candidates, undefined, stays);
  const activityResult = validateItineraryPlan(draft, prefs, candidates);
  const id = (draft as { accommodationId?: unknown }).accommodationId;
  const property = stays.find(stay => stay.id === id);
  const { estimatedTotalUsd, ...result } = activityResult;
  if (request.mode === "activities") {
    if (id !== null) throw new InvalidItineraryPlanError("Invalid accommodation selection");
    return {
      ...result,
      mode: "activities",
      accommodation: null,
      estimatedCosts: {
        activitiesUsd: estimatedTotalUsd,
        accommodationUsd: 0,
        totalUsd: estimatedTotalUsd,
      },
    };
  }

  if (!property) throw new InvalidItineraryPlanError("Invalid accommodation selection");
  return {
    ...result,
    mode: "activities_and_accommodation",
    accommodation: { ...request.accommodation, property },
    estimatedCosts: {
      activitiesUsd: estimatedTotalUsd,
      accommodationUsd: property.totalCents / 100,
      totalUsd: (Math.round(estimatedTotalUsd * 100) + property.totalCents) / 100,
    },
    warnings: [
      ...result.warnings,
      "Accommodation availability was checked but is not reserved; confirm pricing and availability before booking.",
    ],
  };
}
export class NoAccommodationCandidatesError extends Error {
  constructor() { super("No accommodation matches the stay dates, group size and budget"); }
}
