import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import type { ItineraryPrefs } from "./types";
import {
  MAX_ITINERARY_ACTIVITY_CANDIDATES,
  retrieveActivityCandidates,
} from "./retrieve";

const prefs: ItineraryPrefs = {
  tripStartDate: "2026-10-01",
  tripEndDate: "2026-10-07",
  budgetUsd: 800,
  groupSize: 4,
  categories: ["culture", "nature"],
};

const activity = {
  id: "activity-1",
  title: "Island Garden Walk",
  category: "nature",
  duration_hours: 2,
  price_per_person: 45,
  max_capacity: null,
  location: "Barbados",
  image_url: null,
};

function makeQuery(data: unknown, error: { message: string } | null = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    lte: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };

  for (const method of [
    query.select,
    query.eq,
    query.in,
    query.not,
    query.lte,
    query.or,
    query.order,
  ]) {
    method.mockReturnValue(query);
  }
  query.limit.mockResolvedValue({ data, error });

  const supabase = {
    from: vi.fn(() => query),
  } as unknown as SupabaseClient<Database>;

  return { supabase, query };
}

describe("retrieveActivityCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects bounded published candidates matching categories, capacity, and budget", async () => {
    const { supabase, query } = makeQuery([activity]);

    const result = await retrieveActivityCandidates(supabase, prefs);

    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(query.select).toHaveBeenCalledWith(
      "id,title,category,duration_hours,price_per_person,max_capacity,location,image_url",
    );
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.in).toHaveBeenCalledWith("category", prefs.categories);
    expect(query.not).toHaveBeenCalledWith("price_per_person", "is", null);
    expect(query.lte).toHaveBeenCalledWith("price_per_person", 200);
    expect(query.or).toHaveBeenCalledWith("max_capacity.is.null,max_capacity.gte.4");
    expect(query.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: false,
    });
    expect(query.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    expect(query.limit).toHaveBeenCalledWith(MAX_ITINERARY_ACTIVITY_CANDIDATES);
    expect(result).toEqual([activity]);
  });

  it.each([
    [30.15, 3, 10.05],
    [30.14, 3, 10.04],
    [30.149, 3, 10.04],
    [0.29, 1, 0.29],
  ])("uses a whole-cent price ceiling for a $%s budget and %s people", async (budgetUsd, groupSize, ceiling) => {
    const { supabase, query } = makeQuery([activity]);

    await retrieveActivityCandidates(supabase, { ...prefs, budgetUsd, groupSize });

    expect(query.lte).toHaveBeenCalledWith("price_per_person", ceiling);
  });

  it("returns an empty candidate list when no activities match", async () => {
    const { supabase } = makeQuery(null);

    await expect(retrieveActivityCandidates(supabase, prefs)).resolves.toEqual([]);
  });

  it("throws when the activity query fails", async () => {
    const { supabase } = makeQuery(null, { message: "Activity query failed" });

    await expect(retrieveActivityCandidates(supabase, prefs)).rejects.toThrow(
      "Activity query failed",
    );
  });
});
