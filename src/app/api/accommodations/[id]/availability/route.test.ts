import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { getAccommodationById } from "@/lib/accommodations/service";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/accommodations/service", () => ({ getAccommodationById: vi.fn() }));

const id = "11111111-1111-4111-8111-111111111111";
const rpc = vi.fn();
const quote = {
  available: true,
  nights: 3,
  unit_price_cents: 12550,
  total_cents: 45100,
  currency: "usd",
  nightly_prices: [
    { night: "2099-07-01", price_cents: 12550 },
    { night: "2099-07-02", price_cents: 20000 },
    { night: "2099-07-03", price_cents: 12550 },
  ],
};
const listing = {
  id,
  status: "published",
  price_min_usd: 125.5,
  max_guest_capacity: 4,
};

function request(query = "check_in=2099-07-01&check_out=2099-07-04&guests=2") {
  return GET(new Request(`http://localhost/api/accommodations/${id}/availability?${query}`), {
    params: Promise.resolve({ id }),
  });
}

describe("accommodation availability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    vi.mocked(getAccommodationById).mockResolvedValue(listing as never);
    rpc.mockResolvedValue({ data: quote, error: null });
  });

  it("quotes nights, not guests, and asks the inventory RPC about other buyers' holds", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(quote);
    expect(rpc).toHaveBeenCalledWith("accommodation_stay_quote", {
      p_accommodation_id: id,
      p_check_in: "2099-07-01",
      p_check_out: "2099-07-04",
    });
  });

  it("reports unavailable inventory without returning private booking data", async () => {
    rpc.mockResolvedValue({ data: { ...quote, available: false }, error: null });
    expect(await (await request()).json()).toEqual({ ...quote, available: false });
  });

  it("does not fall back to the listing rate for closed or unconfigured dates", async () => {
    const closed = { ...quote, available: false, unit_price_cents: 0, total_cents: 0, nightly_prices: [] };
    rpc.mockResolvedValue({ data: closed, error: null });
    expect(await (await request()).json()).toEqual(closed);
  });

  it.each([
    "check_in=2099-02-30&check_out=2099-03-04&guests=2",
    "check_in=2099-07-01&check_out=2099-07-01&guests=2",
    "check_in=2000-07-01&check_out=2000-07-04&guests=2",
    "check_in=2099-07-01&check_out=2099-07-04&guests=1.5",
    "check_in=2099-07-01&check_out=2099-07-04&guests=0",
    "check_in=2099-07-01&check_out=2099-07-04&guests=5",
  ])("rejects invalid stay input: %s", async (query) => {
    expect((await request(query)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not offer a missing or unpublished listing", async () => {
    vi.mocked(getAccommodationById).mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed on an inventory error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "internal database detail" } });
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Could not check accommodation availability. Please try again.",
    });
  });
});
