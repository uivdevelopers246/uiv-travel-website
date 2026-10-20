import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import type { ItineraryActivityCandidate, ItineraryPrefs } from "./types";
import { assertAndRecordItineraryGeneration } from "./rateLimit";
import { retrieveActivityCandidates } from "./retrieve";
import { generateItineraryPlan } from "./plan";
import {
  createItinerary,
  NoItineraryCandidatesError,
} from "./service";

vi.mock("./rateLimit", () => ({
  assertAndRecordItineraryGeneration: vi.fn(),
}));
vi.mock("./retrieve", () => ({
  retrieveActivityCandidates: vi.fn(),
}));
vi.mock("./plan", () => ({
  generateItineraryPlan: vi.fn(),
}));

const prefs: ItineraryPrefs = {
  tripStartDate: "2026-10-01",
  tripEndDate: "2026-10-03",
  budgetUsd: 150,
  groupSize: 2,
  categories: ["culture"],
};

const candidate: ItineraryActivityCandidate = {
  id: "activity-1",
  title: "Historic Bridgetown Walk",
  category: "culture",
  duration_hours: 2,
  price_per_person: 35,
  max_capacity: null,
  location: "Bridgetown",
  image_url: null,
};

const draft = {
  days: [
    {
      date: "2026-10-02",
      theme: "Island history",
      activityIds: ["activity-1"],
    },
  ],
};

const supabase = {} as SupabaseClient<Database>;

describe("createItinerary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("records the generation after retrieval and before planning", async () => {
    const calls: string[] = [];
    vi.mocked(retrieveActivityCandidates).mockImplementation(async () => {
      calls.push("retrieve");
      return [candidate];
    });
    vi.mocked(assertAndRecordItineraryGeneration).mockImplementation(async () => {
      calls.push("rate-limit");
    });
    vi.mocked(generateItineraryPlan).mockImplementation(async () => {
      calls.push("plan");
      return draft;
    });

    const result = await createItinerary(supabase, prefs);

    expect(calls).toEqual(["retrieve", "rate-limit", "plan"]);
    expect(result.estimatedTotalUsd).toBe(70);
  });

  it("consumes a slot when the provider fails without retrying", async () => {
    vi.mocked(retrieveActivityCandidates).mockResolvedValue([candidate]);
    vi.mocked(generateItineraryPlan).mockRejectedValue(new Error("upstream failure"));
    await expect(createItinerary(supabase, prefs)).rejects.toThrow("upstream failure");
    expect(assertAndRecordItineraryGeneration).toHaveBeenCalledTimes(1);
    expect(generateItineraryPlan).toHaveBeenCalledTimes(1);
  });

  it("does not consume a generation when no candidates match", async () => {
    vi.mocked(retrieveActivityCandidates).mockResolvedValue([]);

    await expect(createItinerary(supabase, prefs)).rejects.toBeInstanceOf(
      NoItineraryCandidatesError,
    );
    expect(assertAndRecordItineraryGeneration).not.toHaveBeenCalled();
    expect(generateItineraryPlan).not.toHaveBeenCalled();
  });

  it("does not call the model when the rate limit is exceeded", async () => {
    vi.mocked(retrieveActivityCandidates).mockResolvedValue([candidate]);
    vi.mocked(assertAndRecordItineraryGeneration).mockRejectedValue(
      new Error("Too many itinerary requests. Try again later."),
    );

    await expect(createItinerary(supabase, prefs)).rejects.toThrow(
      "Too many itinerary requests. Try again later.",
    );
    expect(generateItineraryPlan).not.toHaveBeenCalled();
  });
});
