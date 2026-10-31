import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

const { provider, constructor } = vi.hoisted(() => ({ provider: vi.fn(), constructor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { create: provider };
    constructor(options: unknown) { constructor(options); }
  },
}));

const prefs = { tripStartDate: "2026-10-01", tripEndDate: "2026-10-02", budgetUsd: 30.15, groupSize: 3, categories: ["culture"] };
const candidate = { id: "activity-1", title: "History walk", category: "culture", duration_hours: null, price_per_person: 10.05, max_capacity: null, location: "Bridgetown", image_url: null };
const draft = { days: [{ date: prefs.tripStartDate, theme: "History", activityIds: [candidate.id] }] };
const rpc = vi.fn();
const getUser = vi.fn();
const limit = vi.fn();
const query = {
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(), limit,
};
const supabase = { auth: { getUser }, from: vi.fn(() => query), rpc };
const calls: string[] = [];
function post(body: unknown = prefs) {
  return POST(new Request("http://localhost/api/itinerary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

describe("POST /api/itinerary with real orchestration and mocked Supabase/OpenAI", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    calls.length = 0;
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    limit.mockImplementation(async () => { calls.push("retrieve"); return { data: [candidate], error: null }; });
    rpc.mockImplementation(async () => { calls.push("record"); return { data: true, error: null }; });
    provider.mockImplementation(async () => { calls.push("provider"); return { status: "completed", output_text: JSON.stringify(draft) }; });
  });

  it("records before the single model call and returns catalog details at the exact group budget", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ estimatedTotalUsd: 30.15, days: [{ date: prefs.tripStartDate, activities: [{ id: candidate.id, title: candidate.title, duration_hours: null }] }], warnings: [expect.stringContaining("availability has not been checked")] });
    expect(calls).toEqual(["retrieve", "record", "provider"]);
    expect(query.lte).toHaveBeenCalledWith("price_per_person", 10.05);
    expect(constructor).toHaveBeenCalledWith({ apiKey: "test-key", maxRetries: 0, timeout: 60_000 });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("does not retrieve, record or call OpenAI for invalid input", async () => {
    expect((await post({ ...prefs, groupSize: 21 })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("does not consume a slot or call OpenAI for empty retrieval", async () => {
    limit.mockResolvedValue({ data: [], error: null });
    expect((await post()).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("returns 429 without OpenAI when the database denies a slot", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await post()).status).toBe(429);
    expect(provider).not.toHaveBeenCalled();
  });

  it("returns 502 and consumes the slot when the provider fails", async () => {
    provider.mockRejectedValue(new Error("upstream secret"));
    const response = await post();
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("returns 502 for invented activity IDs", async () => {
    provider.mockResolvedValue({ status: "completed", output_text: JSON.stringify({ days: [{ ...draft.days[0], activityIds: ["invented"] }] }) });
    expect((await post()).status).toBe(502);
  });

  it("returns 503 without calling OpenAI when the key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await post()).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });
});
