import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  createItinerary,
  NoItineraryCandidatesError,
} from "@/lib/itinerary/service";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/itinerary/service", () => ({
  createItinerary: vi.fn(),
  NoItineraryCandidatesError: class NoItineraryCandidatesError extends Error {},
}));

const prefs = {
  tripStartDate: "2026-10-01",
  tripEndDate: "2026-10-07",
  budgetUsd: 800,
  groupSize: 2,
  categories: ["culture"],
};
const itinerary = {
  tripStartDate: prefs.tripStartDate,
  tripEndDate: prefs.tripEndDate,
  estimatedTotalUsd: 70,
  days: [],
  warnings: ["Activity availability has not been checked."],
};
const supabase = {
  auth: { getUser: vi.fn() },
};

function post(value: unknown = prefs) {
  return POST(
    new Request("http://localhost/api/itinerary", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify(value),
    }),
  );
}

function postRaw(body: string) {
  return POST(
    new Request("http://localhost/api/itinerary", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body,
    }),
  );
}

describe("POST /api/itinerary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createItinerary).mockResolvedValue(itinerary as never);
  });

  it("authenticates, validates preferences, and returns the itinerary", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(itinerary);
    expect(createItinerary).toHaveBeenCalledWith(supabase, prefs);
  });

  it("returns 401 for an unauthenticated request", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await post();

    expect(response.status).toBe(401);
    expect(createItinerary).not.toHaveBeenCalled();
  });

  it("authenticates only once", async () => {
    await post();
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it.each([null, [], "text"])("rejects a non-object JSON body: %s", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(createItinerary).not.toHaveBeenCalled();
  });

  it("blocks cross-origin requests before authentication", async () => {
    const response = await POST(new Request("http://localhost/api/itinerary", {
      method: "POST", headers: { origin: "https://elsewhere.invalid" }, body: JSON.stringify(prefs),
    }));
    expect(response.status).toBe(403);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("maps invalid model plans to 502", async () => {
    const { InvalidItineraryPlanError } = await import("@/lib/itinerary/validatePlan");
    vi.mocked(createItinerary).mockRejectedValue(new InvalidItineraryPlanError("unknown ID"));
    expect((await post()).status).toBe(502);
  });

  it("returns 400 for invalid preferences", async () => {
    const response = await post({ ...prefs, categories: [] });

    expect(response.status).toBe(400);
    expect(createItinerary).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await postRaw("{");

    expect(response.status).toBe(400);
    expect(createItinerary).not.toHaveBeenCalled();
  });

  it("returns 400 when no activities match", async () => {
    vi.mocked(createItinerary).mockRejectedValue(
      new NoItineraryCandidatesError(),
    );

    const response = await post();

    expect(response.status).toBe(400);
  });

  it("returns 429 when the user has reached the generation limit", async () => {
    const { ItineraryRateLimitError } = await import("@/lib/itinerary/rateLimit");
    vi.mocked(createItinerary).mockRejectedValue(new ItineraryRateLimitError());

    const response = await post();

    expect(response.status).toBe(429);
  });

  it("returns 503 when the OpenAI key is not configured", async () => {
    const { OpenAIConfigurationError } = await import("@/lib/itinerary/plan");
    vi.mocked(createItinerary).mockRejectedValue(new OpenAIConfigurationError());

    const response = await post();

    expect(response.status).toBe(503);
  });

  it("returns 502 for an upstream or invalid model plan error", async () => {
    const { ItineraryModelError } = await import("@/lib/itinerary/plan");
    vi.mocked(createItinerary).mockRejectedValue(
      new ItineraryModelError("provider detail should not be exposed"),
    );

    const response = await post();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Could not generate a valid itinerary. Please try again.",
    });
  });

  it("returns a generic 500 for unexpected failures", async () => {
    vi.mocked(createItinerary).mockRejectedValue(new Error("database secret"));

    const response = await post();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Could not create itinerary. Please try again.",
    });
  });
});
