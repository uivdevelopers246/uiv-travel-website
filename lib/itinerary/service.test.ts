import { retrieveStayCandidates } from "./accommodations";
vi.mock("./accommodations", () => ({ retrieveStayCandidates: vi.fn() }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import type { ItineraryActivityCandidate, ItineraryPrefs } from "./types";
import { assertAndRecordItineraryGeneration } from "./rateLimit";
import { retrieveActivityCandidates } from "./retrieve";
import { generateItineraryPlan } from "./plan";
import {
  createCompleteItinerary,
  NoAccommodationCandidatesError,
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

const activityRequest = { mode: "activities" as const, tripStartDate: prefs.tripStartDate, tripEndDate: prefs.tripEndDate, groupSize: prefs.groupSize, activities: { budgetUsd: prefs.budgetUsd, categories: prefs.categories } };

const draft = {
  accommodationId: null,
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

    const result = await createCompleteItinerary(supabase, activityRequest);

    expect(calls).toEqual(["retrieve", "rate-limit", "plan"]);
    expect(result.estimatedCosts.activitiesUsd).toBe(70);
  });

  it("consumes a slot when the provider fails without retrying", async () => {
    vi.mocked(retrieveActivityCandidates).mockResolvedValue([candidate]);
    vi.mocked(generateItineraryPlan).mockRejectedValue(new Error("upstream failure"));
    await expect(createCompleteItinerary(supabase, activityRequest)).rejects.toThrow("upstream failure");
    expect(assertAndRecordItineraryGeneration).toHaveBeenCalledTimes(1);
    expect(generateItineraryPlan).toHaveBeenCalledTimes(1);
  });

  it("does not consume a generation when no candidates match", async () => {
    vi.mocked(retrieveActivityCandidates).mockResolvedValue([]);

    await expect(createCompleteItinerary(supabase, activityRequest)).rejects.toBeInstanceOf(
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

    await expect(createCompleteItinerary(supabase, activityRequest)).rejects.toThrow(
      "Too many itinerary requests. Try again later.",
    );
    expect(generateItineraryPlan).not.toHaveBeenCalled();
  });
});

describe("combined itineraries", () => {
 const request = { mode: "activities_and_accommodation" as const, tripStartDate: prefs.tripStartDate, tripEndDate: prefs.tripEndDate, groupSize: 2, activities: { budgetUsd: 150, categories: prefs.categories }, accommodation: { budgetUsd: 300, checkInDate: prefs.tripStartDate, checkOutDate: prefs.tripEndDate } };
 beforeEach(() => { vi.resetAllMocks(); vi.mocked(retrieveActivityCandidates).mockResolvedValue([candidate]); });
 it("does not consume a slot when no stays match", async () => {
  vi.mocked(retrieveStayCandidates).mockResolvedValue([]);
  await expect(createCompleteItinerary(supabase, request)).rejects.toBeInstanceOf(NoAccommodationCandidatesError);
  expect(assertAndRecordItineraryGeneration).not.toHaveBeenCalled();
  expect(generateItineraryPlan).not.toHaveBeenCalled();
 });
 it("hydrates the selected stay and adds separate server totals", async () => {
  const property = { id: "stay", name: "Stay", image_url: null, parish: null, totalCents: 20000 };
  vi.mocked(retrieveStayCandidates).mockResolvedValue([property]);
  vi.mocked(generateItineraryPlan).mockResolvedValue({ ...draft, accommodationId: "stay" });
  const result = await createCompleteItinerary(supabase, request);
  expect(result.accommodation?.property).toEqual(property);
  expect(result.estimatedCosts).toEqual({ activitiesUsd: 70, accommodationUsd: 200, totalUsd: 270 });
 });
 it.each([null, "unknown", undefined])("rejects invalid stay ID %s", async accommodationId => {
  vi.mocked(retrieveStayCandidates).mockResolvedValue([{ id: "stay", name: "Stay", image_url: null, parish: null, totalCents: 20000 }]);
  vi.mocked(generateItineraryPlan).mockResolvedValue({ ...draft, accommodationId });
  await expect(createCompleteItinerary(supabase, request)).rejects.toThrow("Invalid accommodation selection");
 });
});
