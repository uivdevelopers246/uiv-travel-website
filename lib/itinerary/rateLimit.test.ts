import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import {
  assertAndRecordItineraryGeneration,
  ItineraryRateLimitError,
} from "./rateLimit";

describe("assertAndRecordItineraryGeneration", () => {
  const rpc = vi.fn();
  const supabase = { rpc } as unknown as SupabaseClient<Database>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("records an allowed generation through the atomic RPC", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(
      assertAndRecordItineraryGeneration(supabase),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("record_itinerary_generation");
  });

  it("throws a rate-limit error when the atomic RPC denies a generation", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    await expect(
      assertAndRecordItineraryGeneration(supabase),
    ).rejects.toBeInstanceOf(ItineraryRateLimitError);
  });

  it("surfaces database errors instead of treating them as rate limits", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Database unavailable" } });

    await expect(
      assertAndRecordItineraryGeneration(supabase),
    ).rejects.toThrow("Could not record itinerary generation: Database unavailable");
  });
});
