import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { PATCH } from "./[id]/route";
import { createClient } from "@/lib/supabase/server";
import { createAccommodation, updateAccommodation } from "@/lib/accommodations/service";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ getUserRole: vi.fn().mockResolvedValue("vendor") }));
vi.mock("@/lib/accommodations/service", () => ({
  createAccommodation: vi.fn(),
  updateAccommodation: vi.fn(),
  getAccommodationById: vi.fn(),
  listAccommodations: vi.fn(),
  deleteAccommodation: vi.fn(),
}));

const id = "11111111-1111-4111-8111-111111111111";
const listingInput = { name: "Ocean View Villa", accommodation_type: "villa" };
const supabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "vendor-user" } } }) } };

function request(method: "POST" | "PATCH", body: Record<string, unknown>) {
  const req = new Request(`http://localhost/api/accommodations/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return method === "POST" ? POST(req) : PATCH(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(supabase as never);
  vi.mocked(createAccommodation).mockResolvedValue({ id } as never);
  vi.mocked(updateAccommodation).mockResolvedValue({ id } as never);
});

describe.each(["POST", "PATCH"] as const)("%s accommodation pricing", (method) => {
  it.each([
    { price_min_usd: 100 },
    { price_max_usd: 200 },
    { price_min_usd: null },
    { price_max_usd: null },
  ])("rejects manual display prices: %j", async (price) => {
    const response = await request(method, { ...listingInput, ...price });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Prices are managed in Calendar & prices." });
    expect(createAccommodation).not.toHaveBeenCalled();
    expect(updateAccommodation).not.toHaveBeenCalled();
  });

  it("saves listing details without manual prices", async () => {
    const response = await request(method, listingInput);
    expect(response.status).toBe(method === "POST" ? 201 : 200);
    if (method === "POST") {
      expect(createAccommodation).toHaveBeenCalledWith(supabase, listingInput);
    } else {
      expect(updateAccommodation).toHaveBeenCalledWith(supabase, id, listingInput, { isAdmin: false });
    }
  });
});
