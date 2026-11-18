import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";

export class ItineraryRateLimitError extends Error {
  constructor() {
    super("Too many itinerary requests. Try again later.");
    this.name = "ItineraryRateLimitError";
  }
}

/** Records a generation atomically or throws when the user is over the limit. */
export async function assertAndRecordItineraryGeneration(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const { data, error } = await supabase.rpc("record_itinerary_generation");

  if (error) {
    throw new Error(`Could not record itinerary generation: ${error.message}`);
  }
  if (data !== true) {
    throw new ItineraryRateLimitError();
  }
}
