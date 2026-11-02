import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { getAccommodationStayQuote } from "@/lib/accommodation-calendar/service";
import type { StayCandidate, StayPreferences } from "./types";
export async function retrieveStayCandidates(client: SupabaseClient<Database>, stay: StayPreferences, groupSize: number): Promise<StayCandidate[]> {
  const { data, error } = await client.from("accommodations").select("id,name,image_url,parish").eq("status", "published").gte("max_guest_capacity", groupSize).order("id").limit(30);
  if (error) throw new Error("Could not retrieve accommodations");
  const candidates: StayCandidate[] = [];
  // Bounded sequential quotes avoid flooding the database with parallel RPCs.
  for (const property of data ?? []) {
    const quote = await getAccommodationStayQuote(client, property.id, stay.checkInDate, stay.checkOutDate);
    if (quote.available && quote.total_cents <= Math.floor(stay.budgetUsd * 100 + 1e-7)) candidates.push({ ...property, totalCents: quote.total_cents });
  }
  return candidates;
}
