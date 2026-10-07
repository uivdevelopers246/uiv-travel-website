import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";

/** Replace legacy listing prices with one batched read of current bookable nights. */
export async function withAccommodationBookablePrices<T extends { id: string }>(
  supabase: SupabaseClient<Database>,
  rows: T[],
): Promise<(T & { price_min_usd: number | null; price_max_usd: number | null })[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase.rpc("accommodation_bookable_price_ranges", {
    p_accommodation_ids: [...new Set(rows.map((row) => row.id))],
  });
  if (error) throw new Error("Could not load accommodation prices");
  const pricesById = new Map((data ?? []).map((price) => [price.accommodation_id, price]));
  return rows.map((row) => {
    const price = pricesById.get(row.id);
    return {
      ...row,
      price_min_usd: price?.price_min_usd ?? null,
      price_max_usd: price?.price_max_usd ?? null,
    };
  });
}
