import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const rpc = vi.fn();
const nights = [{ night: "2026-10-01", price_cents: 12550 }, { night: "2026-10-02", price_cents: null }];
const request = (query = "from=2026-10-01&to=2026-10-02", listingId = id) => GET(
  new Request(`http://localhost/api/accommodations/${listingId}/nights?${query}`),
  { params: Promise.resolve({ id: listingId }) },
);

describe("public accommodation nightly prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: nights, error: null });
  });

  it("returns uncached nightly prices through the public RPC without requiring a login", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ nights });
    expect(rpc).toHaveBeenCalledWith("accommodation_booking_calendar", {
      p_accommodation_id: id, p_first_night: "2026-10-01", p_last_night: "2026-10-02",
    });
  });

  it.each(["", "from=2026-02-30&to=2026-03-01", "from=2026-10-03&to=2026-10-02", "from=2026-10-01&to=2027-10-02"])(
    "rejects invalid or excessive ranges before querying: %s", async (query) => {
      expect((await request(query)).status).toBe(400);
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid IDs", async () => {
    expect((await request(undefined, "invalid")).status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not expose missing or unpublished accommodations", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await request()).status).toBe(404);
  });

  it("reports errors instead of treating failed reads as an unavailable month", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not load nightly prices. Please try again." });
  });
});
