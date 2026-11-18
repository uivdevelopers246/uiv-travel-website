import { describe, expect, it } from "vitest";
import type { ItineraryActivityCandidate, ItineraryPrefs } from "./types";
import {
  InvalidItineraryPlanError,
  validateItineraryPlan,
} from "./validatePlan";

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

const validDraft = {
  days: [
    {
      date: "2026-10-02",
      theme: "Island history",
      activityIds: ["activity-1"],
    },
  ],
};

describe("validateItineraryPlan", () => {
  it("hydrates candidate details and calculates the group total server-side", () => {
    const result = validateItineraryPlan(validDraft, prefs, [candidate]);

    expect(result).toEqual({
      tripStartDate: prefs.tripStartDate,
      tripEndDate: prefs.tripEndDate,
      estimatedTotalUsd: 70,
      days: [
        {
          date: "2026-10-02",
          theme: "Island history",
          activities: [
            {
              id: "activity-1",
              title: "Historic Bridgetown Walk",
              category: "culture",
              duration_hours: 2,
              price_per_person: 35,
              location: "Bridgetown",
              image_url: null,
            },
          ],
        },
      ],
      warnings: [
        "Activity availability has not been checked. Confirm availability before booking.",
      ],
    });
  });

  it("rejects dates outside the user's trip window", () => {
    const draft = {
      days: [{ ...validDraft.days[0], date: "2026-10-04" }],
    };

    expect(() => validateItineraryPlan(draft, prefs, [candidate])).toThrow(
      InvalidItineraryPlanError,
    );
  });

  it("rejects invalid calendar dates", () => {
    const draft = {
      days: [{ ...validDraft.days[0], date: "2026-02-30" }],
    };

    expect(() => validateItineraryPlan(draft, prefs, [candidate])).toThrow(
      "Itinerary day date is outside the trip range",
    );
  });

  it("rejects unknown activity IDs", () => {
    const draft = {
      days: [{ ...validDraft.days[0], activityIds: ["not-a-candidate"] }],
    };

    expect(() => validateItineraryPlan(draft, prefs, [candidate])).toThrow(
      "Itinerary contains an unknown activity ID",
    );
  });

  it("rejects an activity repeated on multiple days", () => {
    const draft = {
      days: [
        validDraft.days[0],
        { ...validDraft.days[0], date: "2026-10-03" },
      ],
    };

    expect(() => validateItineraryPlan(draft, prefs, [candidate])).toThrow(
      "Itinerary contains a duplicate activity",
    );
  });

  it("rejects a plan whose calculated total exceeds the activity budget", () => {
    const lowBudgetPrefs = { ...prefs, budgetUsd: 69.99 };

    expect(() =>
      validateItineraryPlan(validDraft, lowBudgetPrefs, [candidate]),
    ).toThrow("Itinerary exceeds the activity budget");
  });

  it("rejects a plan with no selected activities", () => {
    expect(() => validateItineraryPlan({ days: [{ ...validDraft.days[0], activityIds: [] }] }, prefs, [candidate]))
      .toThrow("Itinerary must recommend at least one activity");
  });

  it("does not round a fractional-cent budget up above the user's limit", () => {
    expect(() => validateItineraryPlan(validDraft, { ...prefs, budgetUsd: 69.999 }, [candidate]))
      .toThrow("Itinerary exceeds the activity budget");
  });

  it("rejects malformed model output", () => {
    expect(() => validateItineraryPlan({ days: "not an array" }, prefs, [candidate])).toThrow(
      "Itinerary plan must contain at least one day",
    );
  });
  it.each([
    null, [], { days: [] }, { days: [null] },
    { days: [{ ...validDraft.days[0], theme: " " }] },
    { days: [{ ...validDraft.days[0], activityIds: "activity-1" }] },
    { days: [{ ...validDraft.days[0], activityIds: [123] }] },
    { days: [{ ...validDraft.days[0], activityIds: [candidate.id, candidate.id] }] },
    { days: [validDraft.days[0], { ...validDraft.days[0], activityIds: [] }] },
  ])("rejects malformed or duplicate assignments: %j", (draft) => {
    expect(() => validateItineraryPlan(draft, prefs, [candidate])).toThrow(InvalidItineraryPlanError);
  });

  it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid catalog price %s", (price_per_person) => {
    expect(() => validateItineraryPlan(validDraft, prefs, [{ ...candidate, price_per_person }])).toThrow("Selected activity is missing a valid price");
  });

  it("preserves unknown metadata and ignores model-supplied listing details and totals", () => {
    const result = validateItineraryPlan({ ...validDraft, estimatedTotalUsd: 0 }, prefs, [{ ...candidate, duration_hours: null }]);
    expect(result.estimatedTotalUsd).toBe(70);
    expect(result.days[0].activities[0].duration_hours).toBeNull();
  });

  it("calculates decimal prices for the group without floating-point budget errors", () => {
    const result = validateItineraryPlan(validDraft, { ...prefs, budgetUsd: 30.15, groupSize: 3 }, [{ ...candidate, price_per_person: 10.05 }]);
    expect(result.estimatedTotalUsd).toBe(30.15);
  });

});
