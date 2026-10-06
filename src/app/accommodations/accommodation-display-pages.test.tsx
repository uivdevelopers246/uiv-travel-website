import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home, { dynamic as homeDynamic } from "@/app/page";
import VacationPlanningPage, { dynamic as vacationDynamic } from "@/app/vacation-planning/page";
import AccommodationDetailPage from "./[id]/page";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => mocks }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/home/HomeShowcase", () => ({
  HomeShowcase: ({ accommodations }: { accommodations: unknown[] }) => <pre>{JSON.stringify(accommodations)}</pre>,
}));
vi.mock("@/app/vacation-planning/VacationPlanningClient", () => ({
  VacationPlanningClient: ({ accommodations }: { accommodations: unknown[] }) => <pre>{JSON.stringify(accommodations)}</pre>,
}));
vi.mock("./[id]/AccommodationDetailClient", () => ({
  AccommodationDetailClient: ({ accommodation }: { accommodation: unknown }) => <pre>{JSON.stringify(accommodation)}</pre>,
}));

const listing = { id: "11111111-1111-4111-8111-111111111111", name: "Beach Villa", price_min_usd: 9999, price_max_usd: 9999 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => {
    const rows = table === "accommodations" ? [listing] : [];
    const query = Object.assign(Promise.resolve({ data: rows, error: null }), {
      select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: rows[0], error: null }),
    });
    for (const method of [query.select, query.eq, query.order, query.limit]) method.mockReturnValue(query);
    return query;
  });
});

describe("accommodation display pages", () => {
  it("renders home and vacation prices per request", () => {
    expect(homeDynamic).toBe("force-dynamic");
    expect(vacationDynamic).toBe("force-dynamic");
  });

  it.each([Home, VacationPlanningPage, () => AccommodationDetailPage({ params: Promise.resolve({ id: listing.id }) })])(
    "replaces legacy prices with the bookable range before rendering %s",
    async (page) => {
      mocks.rpc.mockResolvedValue({ data: [{ accommodation_id: listing.id, price_min_usd: 125.5, price_max_usd: 275 }], error: null });
      const html = renderToStaticMarkup(await page());
      expect(html).toContain("125.5");
      expect(html).toContain("275");
      expect(html).not.toContain("9999");
      expect(mocks.rpc).toHaveBeenCalledWith("accommodation_bookable_price_ranges", { p_accommodation_ids: [listing.id] });
    },
  );

  it("does not fall back to the legacy listing rate when no nights are bookable", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("price_min_usd&quot;:null");
    expect(html).not.toContain("9999");
  });
});
