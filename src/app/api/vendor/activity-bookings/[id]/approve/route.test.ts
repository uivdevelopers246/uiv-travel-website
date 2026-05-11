import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const vendorApprovalMocks = vi.hoisted(() => ({
  approveActivityBookingAsVendor: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  forbidden: vi.fn((message = "Forbidden") =>
    Response.json({ error: message }, { status: 403 }),
  ),
  parseUuidParam: vi.fn(),
  requireSameOriginPost: vi.fn(() => null),
  requireRole: vi.fn(),
  serverError: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 500 }),
  ),
  unauthorized: vi.fn((message = "Unauthorized") =>
    Response.json({ error: message }, { status: 401 }),
  ),
}));

vi.mock("@/lib/supabase/server", () => supabaseServerMocks);
vi.mock("@/lib/orders/vendor-approval", () => vendorApprovalMocks);
vi.mock("@/api-shared/route-helpers", () => routeHelperMocks);

import { POST } from "./route";

const BOOKING_ID = "11111111-1111-1111-1111-111111111111";

function createSupabaseClient() {
  return {};
}

async function invokePost() {
  return POST(new Request("http://localhost/api/vendor/activity-bookings/approve", {
    method: "POST",
  }), {
    params: Promise.resolve({ id: BOOKING_ID }),
  });
}

describe("POST /api/vendor/activity-bookings/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseServerMocks.createClient.mockResolvedValue(createSupabaseClient());
    routeHelperMocks.parseUuidParam.mockReturnValue({ id: BOOKING_ID });
    routeHelperMocks.requireRole.mockResolvedValue({ role: "vendor" });
    vendorApprovalMocks.approveActivityBookingAsVendor.mockResolvedValue({
      outcome: "approved",
    });
  });

  it("returns the structured approval outcome on success", async () => {
    vendorApprovalMocks.approveActivityBookingAsVendor.mockResolvedValue({
      outcome: "payment_failed",
    });

    const response = await invokePost();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      outcome: "payment_failed",
    });
  });

  it("rejects cross-origin approve posts before vendor auth", async () => {
    routeHelperMocks.requireSameOriginPost.mockReturnValueOnce(
      Response.json({ error: "Cross-origin request blocked" }, { status: 403 }),
    );

    const response = await POST(
      new Request("http://localhost/api/vendor/activity-bookings/approve", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      {
        params: Promise.resolve({ id: BOOKING_ID }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Cross-origin request blocked" });
    expect(routeHelperMocks.parseUuidParam).not.toHaveBeenCalled();
    expect(vendorApprovalMocks.approveActivityBookingAsVendor).not.toHaveBeenCalled();
  });
});
