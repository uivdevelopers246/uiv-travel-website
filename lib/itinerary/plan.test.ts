import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryActivityCandidate, ItineraryPrefs } from "./types";
import { generateItineraryPlan, type ItineraryOpenAIClient } from "./plan";

vi.mock("server-only", () => ({}));

const prefs: ItineraryPrefs = {
  tripStartDate: "2026-10-01",
  tripEndDate: "2026-10-02",
  budgetUsd: 200,
  groupSize: 2,
  categories: ["culture"],
};

const candidates: ItineraryActivityCandidate[] = [
  {
    id: "activity-1",
    title: "Historic Bridgetown Walk",
    category: "culture",
    duration_hours: 2,
    price_per_person: 35,
    max_capacity: 8,
    location: "Bridgetown",
    image_url: null,
  },
];

const responsesCreate = vi.fn();
const client = {
  responses: { create: responsesCreate },
} as unknown as ItineraryOpenAIClient;

describe("generateItineraryPlan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requests one strict structured plan using only retrieved candidates", async () => {
    const draft = {
      days: [
        {
          date: "2026-10-01",
          theme: "Island history",
          activityIds: ["activity-1"],
        },
      ],
    };
    responsesCreate.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify(draft),
    });

    await expect(generateItineraryPlan(prefs, candidates, client)).resolves.toEqual(
      draft,
    );

    expect(responsesCreate).toHaveBeenCalledTimes(1);
    const request = responsesCreate.mock.calls[0][0];
    expect(request.model).toBe("gpt-4.1-mini");
    expect(request.text.format).toMatchObject({
      type: "json_schema",
      name: "activity_itinerary_plan",
      strict: true,
    });
    expect(JSON.stringify(request.input)).toContain("activity-1");
  });

  it("rejects an incomplete model response", async () => {
    responsesCreate.mockResolvedValue({ status: "incomplete", output_text: "" });

    await expect(generateItineraryPlan(prefs, candidates, client)).rejects.toThrow(
      "OpenAI did not return a completed itinerary plan",
    );
  });

  it("rejects output that is not valid JSON", async () => {
    responsesCreate.mockResolvedValue({
      status: "completed",
      output_text: "not json",
    });

    await expect(generateItineraryPlan(prefs, candidates, client)).rejects.toThrow(
      "OpenAI returned invalid itinerary plan output",
    );
  });
});
