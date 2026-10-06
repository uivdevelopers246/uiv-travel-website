import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("./VendorBookingsClient", () => ({
  VendorBookingsClient: ({ initialListingFilter }: { initialListingFilter: string }) => <div data-filter={initialListingFilter} />,
}));
import MyListingsBookingsPage from "./page";

describe("property booking links", () => {
  it("opens the vendor dashboard with the selected accommodation", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const html = renderToStaticMarkup(await MyListingsBookingsPage({ searchParams: Promise.resolve({ accommodationId: id }) }));
    expect(html).toContain(`data-filter="accommodation:${id}"`);
  });

  it("ignores invalid or repeated property parameters", async () => {
    for (const accommodationId of [undefined, "invalid-id", ["one", "two"]]) {
      const html = renderToStaticMarkup(await MyListingsBookingsPage({ searchParams: Promise.resolve({ accommodationId }) }));
      expect(html).toContain('data-filter=""');
    }
  });
});
