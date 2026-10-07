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
const accommodationBookingMocks = vi.hoisted(() => ({
  listVendorAccommodationOptions: vi.fn(),
  listVendorAccommodationBookingPreviews: vi.fn(),
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
vi.mock("@/lib/accommodation-bookings/vendor-bookings", () => accommodationBookingMocks);
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
    accommodationBookingMocks.listVendorAccommodationBookingPreviews.mockResolvedValue([]);
    accommodationBookingMocks.listVendorAccommodationOptions.mockResolvedValue([]);
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

  it("requires a signed-in vendor before using service-role booking queries", async () => {
    supabaseServerMocks.createClient.mockResolvedValue(createSupabaseClient(""));
    expect((await GET(createRequest())).status).toBe(401);
    supabaseServerMocks.createClient.mockResolvedValue(createSupabaseClient());
    roleMocks.getUserRole.mockResolvedValue("user");
    expect((await GET(createRequest())).status).toBe(403);
    expect(serviceRoleMocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(accommodationBookingMocks.listVendorAccommodationBookingPreviews).not.toHaveBeenCalled();
  });

  it("merges both booking kinds before applying pagination, scoped to the current vendor", async () => {
    vendorBookingMocks.listVendorBookingPreviews.mockResolvedValue([
      { id: "activity-booking", created_at: "2026-06-01T00:00:00Z" },
    ]);
    accommodationBookingMocks.listVendorAccommodationBookingPreviews.mockResolvedValue([
      { id: "stay-booking", created_at: "2026-06-02T00:00:00Z", check_in: "2026-07-01", guests: 2 },
    ]);
    const response = await GET(createRequest("limit=1&offset=1"));
    const body = await response.json();
    expect(body.bookings).toEqual([
      { id: "activity-booking", created_at: "2026-06-01T00:00:00Z", line_type: "activity" },
    ]);
    expect(accommodationBookingMocks.listVendorAccommodationBookingPreviews).toHaveBeenCalledWith(
      { client: "service-role" }, expect.objectContaining({ vendorId: VENDOR_ID, status: "pending_approval", limit: 3, offset: 0 }),
    );
  });

  it("filters stays by property without including activity requests", async () => {
    const response = await GET(createRequest(`accommodationId=${ACTIVITY_ID}`));
    expect(response.status).toBe(200);
    expect(vendorBookingMocks.listVendorBookingPreviews).not.toHaveBeenCalled();
    expect(accommodationBookingMocks.listVendorAccommodationBookingPreviews).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ accommodationId: ACTIVITY_ID, vendorId: VENDOR_ID }),
    );
  });

  it("reports another page only when a booking exists beyond the current page", async () => {
    accommodationBookingMocks.listVendorAccommodationBookingPreviews.mockResolvedValue([
      { id: "stay-newer", created_at: "2026-06-02T00:00:00Z" },
      { id: "stay-older", created_at: "2026-06-01T00:00:00Z" },
    ]);
    const firstPage = await (await GET(createRequest("limit=1"))).json();
    const secondPage = await (await GET(createRequest("limit=1&offset=1"))).json();
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.bookings[0].id).toBe("stay-newer");
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.bookings[0].id).toBe("stay-older");
  });

  it.each(["activity", "accommodation"])("paginates %s bookings beyond the database response limit", async (kind) => {
    const rows = Array.from({ length: 1022 }, (_, index) => ({
      id: `booking-${index}`,
      created_at: new Date(Date.UTC(2026, 9, 2) - index * 60_000).toISOString(),
    }));
    const list = kind === "activity"
      ? vendorBookingMocks.listVendorBookingPreviews
      : accommodationBookingMocks.listVendorAccommodationBookingPreviews;
    list.mockImplementation(async (_client, { offset, limit }) =>
      rows.slice(offset, offset + Math.min(limit, 1000)),
    );

    const response = await GET(createRequest("limit=20&offset=1000"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.bookings.map((booking: { id: string }) => booking.id)).toEqual(
      rows.slice(1000, 1020).map((booking) => booking.id),
    );
    expect(body.hasMore).toBe(true);
  });

  it("rejects malformed or conflicting property filters before querying bookings", async () => {
    expect((await GET(createRequest("accommodationId=not-a-uuid"))).status).toBe(400);
    expect((await GET(createRequest(`accommodationId=${ACTIVITY_ID}&activityId=${ACTIVITY_ID}`))).status).toBe(400);
    expect(accommodationBookingMocks.listVendorAccommodationBookingPreviews).not.toHaveBeenCalled();
  });
});
