import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), role: vi.fn(), vendor: vi.fn(), validId: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("../../../_shared/server", () => ({
  requireManageListingAccess: mocks.role,
  getCurrentVendorIdForManage: mocks.vendor,
  isValidUuid: mocks.validId,
}));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("./AccommodationCalendarManager", () => ({ AccommodationCalendarManager: () => <div>Calendar editor</div> }));
import AccommodationCalendarPage from "./page";

const id = "00000000-0000-4000-8000-000000000001";
const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validId.mockReturnValue(true);
  mocks.role.mockResolvedValue("vendor");
  mocks.vendor.mockResolvedValue("vendor-1");
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id, name: "Sea House", parish: "Saint George", address: null }, error: null });
  mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
});

describe("host calendar page authorization", () => {
  it("scopes vendors to their own accommodation and links to its booking requests", async () => {
    const html = renderToStaticMarkup(await AccommodationCalendarPage({ params: Promise.resolve({ id }) }));
    expect(query.eq).toHaveBeenCalledWith("vendor_id", "vendor-1");
    expect(html).toContain("Calendar editor");
    expect(html).toContain(`/my-listings/bookings?accommodationId=${id}`);
  });

  it("allows admins to manage the requested property without requiring a vendor profile", async () => {
    mocks.role.mockResolvedValue("admin");
    const html = renderToStaticMarkup(await AccommodationCalendarPage({ params: Promise.resolve({ id }) }));
    expect(mocks.vendor).not.toHaveBeenCalled();
    expect(query.eq).not.toHaveBeenCalledWith("vendor_id", expect.anything());
    expect(html).toContain("Calendar editor");
  });

  it("does not render the calendar for missing ownership or unauthorized roles", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    let html = renderToStaticMarkup(await AccommodationCalendarPage({ params: Promise.resolve({ id }) }));
    expect(html).toContain("Accommodation not found");
    expect(html).not.toContain("Calendar editor");
    query.eq.mockClear();
    mocks.role.mockResolvedValue(null);
    html = renderToStaticMarkup(await AccommodationCalendarPage({ params: Promise.resolve({ id }) }));
    expect(html).toContain("Access denied");
    expect(query.eq).not.toHaveBeenCalled();
  });

  it("handles invalid links and vendors without a profile before querying properties", async () => {
    mocks.validId.mockReturnValue(false);
    let html = renderToStaticMarkup(await AccommodationCalendarPage({ params: Promise.resolve({ id: "bad" }) }));
    expect(html).toContain("Invalid accommodation");
    expect(mocks.createClient).not.toHaveBeenCalled();
    mocks.validId.mockReturnValue(true);
    mocks.vendor.mockResolvedValue(null);
    html = renderToStaticMarkup(await AccommodationCalendarPage({ params: Promise.resolve({ id }) }));
    expect(html).toContain("Vendor profile required");
    expect(query.eq).not.toHaveBeenCalled();
  });
});
