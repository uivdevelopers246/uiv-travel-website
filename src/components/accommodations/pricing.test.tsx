import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatAccommodationNightlyPrice, matchesAccommodationPriceRange } from "./pricing";
import { AccommodationCard } from "./AccommodationCard";

describe("calendar price display", () => {
  it.each([
    [125, 125, "$125/night"],
    [125.5, 225.75, "$125.5 - $225.75/night"],
    [null, null, "No available nights"],
  ])("formats %s to %s as %s", (price_min_usd, price_max_usd, expected) => {
    const prices = { price_min_usd, price_max_usd };
    expect(formatAccommodationNightlyPrice(prices)).toBe(expected);
    const html = renderToStaticMarkup(<AccommodationCard accommodation={{
      id: "stay-1", name: "Beach Villa", accommodation_type: "villa", bedroom_count: 2,
      bed_count: 2, bathroom_count: 1, max_guest_capacity: 4, ...prices, amenities: [],
      address: null, parish: null, image_url: null, is_featured: false,
    }} />);
    expect(html).toContain(expected);
  });

  it("keeps unavailable stays out of every price band while allowing unfiltered browsing", () => {
    expect(matchesAccommodationPriceRange(null, "all")).toBe(true);
    for (const range of ["0-100", "100-250", "500+"]) {
      expect(matchesAccommodationPriceRange(null, range)).toBe(false);
    }
    expect(matchesAccommodationPriceRange(125.5, "100-250")).toBe(true);
    expect(matchesAccommodationPriceRange(250.01, "100-250")).toBe(false);
    expect(matchesAccommodationPriceRange(499.99, "500+")).toBe(false);
    expect(matchesAccommodationPriceRange(500, "500+")).toBe(true);
  });
});
