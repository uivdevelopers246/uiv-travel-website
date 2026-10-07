import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ getUserRole: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const rpc = vi.fn();
const params = () => ({ params: Promise.resolve({ id }) });
const body = { first_night: "2099-07-01", last_night: "2099-07-03", is_available: true, price_cents: 12550 };
const post = (value: unknown = body, origin = "http://localhost") => POST(new Request(`http://localhost/api/accommodations/${id}/calendar`, {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value),
}), params());

describe("host accommodation calendar API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    vi.mocked(getUserRole).mockResolvedValue("vendor");
    rpc.mockResolvedValue({ data: 3, error: null });
  });

  it("writes an inclusive date range through the ownership-checked RPC", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 3 });
    expect(rpc).toHaveBeenCalledWith("set_accommodation_nights", {
      p_accommodation_id: id, p_first_night: "2099-07-01", p_last_night: "2099-07-03", p_is_available: true, p_price_cents: 12550,
    });
  });

  it("returns owner-only calendar dates without caching", async () => {
    const nights = [{ night: "2099-07-01", is_available: false, price_cents: null, is_held: false }];
    rpc.mockResolvedValue({ data: nights, error: null });
    const response = await GET(new Request(`http://localhost/api/accommodations/${id}/calendar?from=2099-07-01&to=2099-07-01`), params());
    expect(await response.json()).toEqual({ nights });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([["guest", 401], ["user", 403]] as const)("blocks %s access", async (role, status) => {
    vi.mocked(getUserRole).mockResolvedValue(role);
    expect((await post()).status).toBe(status);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects another origin before invoking auth or storage", async () => {
    expect((await post(body, "https://other.example")).status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid range and fractional prices", async () => {
    expect((await post({ ...body, last_night: "2099-06-30" })).status).toBe(400);
    expect((await post({ ...body, price_cents: 1.5 })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["42501", 403], ["P0002", 404], ["23P01", 409], ["XX000", 500]])("maps database rejection %s safely", async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "internal details" } });
    const response = await post();
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("internal details");
  });
});
