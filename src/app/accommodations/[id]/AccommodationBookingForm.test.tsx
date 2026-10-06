import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AccommodationBookingForm } from "./AccommodationBookingForm";
import { AccommodationDetailClient } from "./AccommodationDetailClient";

vi.mock("@/components/shared", () => Object.fromEntries([
  "Breadcrumb", "ImageGallery", "HomeIcon", "BathIcon", "BedIcon", "UsersIcon", "LocationIcon",
  "ListingMap", "CheckIcon", "XIcon",
].map((name) => [name, () => null])));

describe("accommodation booking form", () => {
  it("renders accessible native inputs and prevents adding an unchecked stay", () => {
    const html = renderToStaticMarkup(<AccommodationBookingForm accommodationId="stay-123" maxGuests={4} />);
    expect(html).toContain('aria-label="Book your stay"');
    expect(html).toContain('aria-label="Nightly prices calendar"');
    expect(html.match(/type="date"/g)).toHaveLength(2);
    expect(html).toContain('name="check_in"');
    expect(html).toContain('name="check_out"');
    const guestsInput = html.match(/<input\b[^>]*name="guests"[^>]*>/)?.[0];
    for (const attribute of ['type="number"', 'min="1"', 'max="4"', 'step="1"']) {
      expect(guestsInput).toContain(attribute);
    }
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
    expect(html).toContain("Choose your check-in and check-out dates.");
    expect(html).toContain("securely save your card with Stripe");
    expect(html).toContain("only be charged after the host confirms");
  });

  it("restores dates and guests after login but still requires a fresh availability check", () => {
    const html = renderToStaticMarkup(<AccommodationBookingForm accommodationId="stay-123" maxGuests={4}
      initialSelection={{ checkIn: "2099-01-02", checkOut: "2099-01-05", guests: "3" }} />);
    expect(html).toContain('value="2099-01-02"');
    expect(html).toContain('value="2099-01-05"');
    expect(html).toContain('value="3"');
    expect(html).toContain("Checking availability and price");
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  });

  it("keeps date selection available when the listing has no base price", () => {
    const html = renderToStaticMarkup(<AccommodationDetailClient images={[]} accommodation={{
      id: "stay-123", name: "Beach Villa", accommodation_type: "villa",
      bedroom_count: 2, bed_count: 2, bathroom_count: 1, max_guest_capacity: 4,
      price_min_usd: null, price_max_usd: null, check_in_time: null, check_out_time: null,
      suitable_for_children: true, wheelchair_accessible: false, smoking_allowed: false,
      pets_allowed: false, beach_access_or_view: false, transportation_provided: false,
      amenities: [], address: null, parish: null, transportation_notes: null, pickup_notes: null,
      image_url: null, is_featured: false, vendors: null,
    }} />);
    expect(html).toContain('aria-label="Book your stay"');
    expect(html).toContain("No available nights");
    expect(html).toContain("Nightly rates may vary");
    expect(html).toContain('name="check_in"');
    expect(html).not.toContain("Online booking is not available until");
  });
});
