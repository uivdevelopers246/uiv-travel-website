import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const roleMocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
}));

const vendorServiceMocks = vi.hoisted(() => ({
  getVendorByOwner: vi.fn(),
}));

const activityBookingServiceMocks = vi.hoisted(() => ({
  listActivityBookings: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  serverError: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 500 }),
  ),
}));

vi.mock("@/lib/supabase/server", () => supabaseServerMocks);
vi.mock("@/lib/auth/roles", () => roleMocks);
vi.mock("@/lib/vendors/service", () => vendorServiceMocks);
vi.mock("@/lib/activity-bookings/service", () => activityBookingServiceMocks);
vi.mock("@/api-shared/route-helpers", () => routeHelperMocks);

import { GET } from "./route";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const VENDOR_ID = "22222222-2222-2222-2222-222222222222";

function createSupabaseClient(userId = USER_ID) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: userId ? { id: userId } : null,
        },
      }),
    },
  };
}

function createRequest(query = "") {
  const suffix = query ? `?${query}` : "";
  return new Request(`http://localhost/api/vendor/activity-bookings${suffix}`);
}

describe("GET /api/vendor/activity-bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseServerMocks.createClient.mockResolvedValue(createSupabaseClient());
    roleMocks.getUserRole.mockResolvedValue("vendor");
    vendorServiceMocks.getVendorByOwner.mockResolvedValue({ id: VENDOR_ID });
    activityBookingServiceMocks.listActivityBookings.mockResolvedValue([]);
  });

  it("returns a generic 500 when vendor lookup fails", async () => {
    vendorServiceMocks.getVendorByOwner.mockRejectedValue(
      new Error("new row violates row-level security policy"),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong. Please try again." });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });

  it("returns a generic 500 when listing bookings fails", async () => {
    activityBookingServiceMocks.listActivityBookings.mockRejectedValue(
      new Error("Could not list activity bookings: connection reset by peer"),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong. Please try again." });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });
});
