import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const serviceRoleMocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

const roleMocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
}));

const vendorServiceMocks = vi.hoisted(() => ({
  getVendorByOwner: vi.fn(),
}));

const vendorBookingMocks = vi.hoisted(() => ({
  listVendorBookingActivityOptions: vi.fn(),
  listVendorBookingPreviews: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  serverError: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 500 }),
  ),
}));

vi.mock("@/lib/supabase/server", () => supabaseServerMocks);
vi.mock("@/lib/supabase/service-role", () => serviceRoleMocks);
vi.mock("@/lib/auth/roles", () => roleMocks);
vi.mock("@/lib/vendors/service", () => vendorServiceMocks);
vi.mock("@/lib/activity-bookings/vendor-bookings", () => vendorBookingMocks);
vi.mock("@/api-shared/route-helpers", () => routeHelperMocks);

import { GET } from "./route";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const VENDOR_ID = "22222222-2222-2222-2222-222222222222";
const ACTIVITY_ID = "33333333-3333-3333-3333-333333333333";

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
  return new Request(`http://localhost/api/vendor/bookings${suffix}`);
}

describe("GET /api/vendor/bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseServerMocks.createClient.mockResolvedValue(createSupabaseClient());
    serviceRoleMocks.createServiceRoleClient.mockReturnValue({ client: "service-role" });
    roleMocks.getUserRole.mockResolvedValue("vendor");
    vendorServiceMocks.getVendorByOwner.mockResolvedValue({ id: VENDOR_ID });
    vendorBookingMocks.listVendorBookingPreviews.mockResolvedValue([]);
    vendorBookingMocks.listVendorBookingActivityOptions.mockResolvedValue([
      { id: ACTIVITY_ID, title: "Kayak Tour" },
    ]);
  });

  it("returns a generic 500 when vendor lookup fails", async () => {
    vendorServiceMocks.getVendorByOwner.mockRejectedValue(
      new Error("permission denied for table vendors"),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong. Please try again." });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });

  it("returns a generic 500 when the service-role query fails", async () => {
    vendorBookingMocks.listVendorBookingPreviews.mockRejectedValue(
      new Error("Could not load vendor bookings: relation activity_bookings does not exist"),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong. Please try again." });
    expect(routeHelperMocks.serverError).toHaveBeenCalledWith(
      "Something went wrong. Please try again.",
    );
  });

  it("preserves the existing 400 for invalid status", async () => {
    const response = await GET(createRequest("status=not-a-real-status"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid status." });
  });

  it("preserves the existing 403 when no vendor record exists", async () => {
    vendorServiceMocks.getVendorByOwner.mockResolvedValue(null);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "User is not associated with a vendor" });
  });
});
