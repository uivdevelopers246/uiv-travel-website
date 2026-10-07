import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { addOrMergeAccommodationLine } from "@/lib/cart/service";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ getUserRole: vi.fn() }));
vi.mock("@/lib/cart/service", () => ({
  addOrMergeAccommodationLine: vi.fn(),
  addOrMergeActivityLine: vi.fn(),
  listCartLinesWithPreview: vi.fn(),
}));

const body = {
  accommodation_id: "11111111-1111-4111-8111-111111111111",
  check_in: "2099-07-01", check_out: "2099-07-04", guests: 2,
  expected_total_cents: 55000,
};
const post = (value: unknown = body) => POST(new Request("http://localhost/api/cart/lines", {
  method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
  body: JSON.stringify(value),
}));

describe("accommodation cart quote guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createClient).mockResolvedValue({} as never);
    vi.mocked(getUserRole).mockResolvedValue("user");
    vi.mocked(addOrMergeAccommodationLine).mockResolvedValue({ id: "line" } as never);
  });

  it("passes the buyer's reviewed total to the authoritative pricing check", async () => {
    expect((await post()).status).toBe(200);
    expect(addOrMergeAccommodationLine).toHaveBeenCalledWith({}, body);
  });

  it.each([-1, 1.5, "55000", null, 2147483648])("rejects invalid reviewed totals: %s", async (total) => {
    expect((await post({ ...body, expected_total_cents: total })).status).toBe(400);
    expect(addOrMergeAccommodationLine).not.toHaveBeenCalled();
  });

  it("returns an actionable error when the host changed a quoted price", async () => {
    const message = "Accommodation price has changed. Remove this stay and add it again to review the current price.";
    vi.mocked(addOrMergeAccommodationLine).mockRejectedValue(new Error(message));
    const response = await post();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: message });
  });
});
