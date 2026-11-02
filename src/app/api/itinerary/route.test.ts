import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  createCompleteItinerary,
  NoItineraryCandidatesError,
} from "@/lib/itinerary/service";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/itinerary/service", () => ({
  createCompleteItinerary: vi.fn(),
  NoAccommodationCandidatesError: class NoAccommodationCandidatesError extends Error {},
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
  mode: "activities",
  accommodation: null,
  estimatedCosts: { activitiesUsd: 70, accommodationUsd: 0, totalUsd: 70 },
  days: [],
  warnings: ["Activity availability has not been checked."],
};
const supabase = {
  auth: { getUser: vi.fn() },
};

const toRequest = (p: typeof prefs) => { const { budgetUsd, categories, ...common } = p; return { ...common, mode: "activities", activities: { budgetUsd, categories } }; };

function post(value: unknown = prefs) {
  return POST(
    new Request("http://localhost/api/itinerary", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify(value && typeof value === "object" && !Array.isArray(value) ? toRequest(value as typeof prefs) : value),
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
    vi.mocked(createCompleteItinerary).mockResolvedValue(itinerary as never);
  });

  it("authenticates, validates preferences, and returns the itinerary", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(itinerary);
    expect(createCompleteItinerary).toHaveBeenCalledWith(supabase, toRequest(prefs));
  });

  it("returns 401 for an unauthenticated request", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await post();

    expect(response.status).toBe(401);
    expect(createCompleteItinerary).not.toHaveBeenCalled();
  });

  it("authenticates only once", async () => {
    await post();
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it.each([null, [], "text"])("rejects a non-object JSON body: %s", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(createCompleteItinerary).not.toHaveBeenCalled();
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
    vi.mocked(createCompleteItinerary).mockRejectedValue(new InvalidItineraryPlanError("unknown ID"));
    expect((await post()).status).toBe(502);
  });

  it("returns 400 for invalid preferences", async () => {
    const response = await post({ ...prefs, categories: [] });

    expect(response.status).toBe(400);
    expect(createCompleteItinerary).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await postRaw("{");

    expect(response.status).toBe(400);
    expect(createCompleteItinerary).not.toHaveBeenCalled();
  });

  it("returns 400 when no activities match", async () => {
    vi.mocked(createCompleteItinerary).mockRejectedValue(
      new NoItineraryCandidatesError(),
    );

    const response = await post();

    expect(response.status).toBe(400);
  });

  it("returns 429 when the user has reached the generation limit", async () => {
    const { ItineraryRateLimitError } = await import("@/lib/itinerary/rateLimit");
    vi.mocked(createCompleteItinerary).mockRejectedValue(new ItineraryRateLimitError());

    const response = await post();

    expect(response.status).toBe(429);
  });

  it("returns 503 when the OpenAI key is not configured", async () => {
    const { OpenAIConfigurationError } = await import("@/lib/itinerary/plan");
    vi.mocked(createCompleteItinerary).mockRejectedValue(new OpenAIConfigurationError());

    const response = await post();

    expect(response.status).toBe(503);
  });

  it("returns 502 for an upstream or invalid model plan error", async () => {
    const { ItineraryModelError } = await import("@/lib/itinerary/plan");
    vi.mocked(createCompleteItinerary).mockRejectedValue(
      new ItineraryModelError("provider detail should not be exposed"),
    );

    const response = await post();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Could not generate a valid itinerary. Please try again.",
    });
  });

  it("returns a generic 500 for unexpected failures", async () => {
    vi.mocked(createCompleteItinerary).mockRejectedValue(new Error("database secret"));

    const response = await post();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Could not create itinerary. Please try again.",
    });
  });
  it("returns 401 when Supabase rejects the session", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "Expired token" } });
    expect((await post()).status).toBe(401);
    expect(createCompleteItinerary).not.toHaveBeenCalled();
  });

  it("maps authentication infrastructure failures to a generic 500", async () => {
    supabase.auth.getUser.mockRejectedValue(new Error("internal connection detail"));
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not create itinerary. Please try again." });
    expect(createCompleteItinerary).not.toHaveBeenCalled();
  });

  it("rejects the old flat API format", async () => {
    expect((await postRaw(JSON.stringify(prefs))).status).toBe(400);
    expect(createCompleteItinerary).not.toHaveBeenCalled();
  });

  it("returns 400 when the required accommodation section has no candidates", async () => {
    const { NoAccommodationCandidatesError } = await import("@/lib/itinerary/service");
    vi.mocked(createCompleteItinerary).mockRejectedValue(new NoAccommodationCandidatesError());
    expect((await postRaw(JSON.stringify({ ...toRequest(prefs), mode: "activities_and_accommodation", accommodation: { budgetUsd: 100, checkInDate: prefs.tripStartDate, checkOutDate: prefs.tripEndDate } }))).status).toBe(400);
  });

});
