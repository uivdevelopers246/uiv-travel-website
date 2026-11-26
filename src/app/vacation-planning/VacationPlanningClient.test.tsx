import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ActivityDisplay } from "@/lib/activities/types";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import type { ListingMapMarker } from "@/components/shared/ListingMap";

vi.mock("@/components/activities", () => ({ ActivityGrid: () => null }));
vi.mock("@/components/accommodations", () => ({ AccommodationGrid: () => null }));
vi.mock("@/components/shared", () => ({ ListingMap: ({ markers, title }: { markers: ListingMapMarker[]; title: string }) => <div data-map-title={title}>{markers.map(marker => <span key={marker.id} data-kind={marker.kind}>{marker.id}</span>)}</div> }));
vi.mock("@/components/shared/mapbox", () => ({ getMapboxToken: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { VacationPlanningClient } from "./VacationPlanningClient";

const featured: ActivityDisplay = {
  id: "featured", title: "Featured tour", description: null, location: null,
  category: "culture", duration_hours: 2, price_per_person: 80,
  max_capacity: 10, image_url: null, is_featured: true,
};

describe("featured experience details", () => {
  it("links both responsive featured panels to their own listing", () => {
    const stay: AccommodationDisplay = {
      id: "featured-stay", name: "Beach stay", accommodation_type: "villa",
      bedroom_count: 2, bed_count: 2, bathroom_count: 1, max_guest_capacity: 4,
      price_min_usd: 150, price_max_usd: 150, amenities: [], address: null,
      parish: null, image_url: null, is_featured: true,
    };
    const html = renderToStaticMarkup(<VacationPlanningClient activities={[featured]} accommodations={[stay]} />);
    expect(html.match(/href="\/accommodations\/featured-stay"/g)).toHaveLength(2);
    expect(html.match(/href="\/activities\/featured"/g)).toHaveLength(2);
    expect(html.match(/aria-label="View featured stay: Beach stay"/g)).toHaveLength(2);
    expect(html.match(/aria-label="View featured activity: Featured tour"/g)).toHaveLength(2);
  });

  it("does not create featured links when the catalogue is empty", () => {
    const html = renderToStaticMarkup(<VacationPlanningClient activities={[]} accommodations={[]} />);
    expect(html).not.toContain("View featured stay:");
    expect(html).not.toContain("View featured activity:");
    expect(html).not.toContain('href="/accommodations/');
    expect(html).not.toContain('href="/activities/');
  });

  it.each(["activities", "accommodations"] as const)("initializes the map to the %s collection", initialTab => {
    const stay: AccommodationDisplay = { id: "mapped-stay", name: "Stay", accommodation_type: "villa", latitude: 13.2, longitude: -59.6, bedroom_count: 4, bed_count: 4, bathroom_count: 2, max_guest_capacity: 30, price_min_usd: null, price_max_usd: null, amenities: [], address: null, parish: null, image_url: null, is_featured: false };
    const html = renderToStaticMarkup(<VacationPlanningClient activities={[{ ...featured, id: "mapped-tour", latitude: 13.2, longitude: -59.6, price_per_person: 300 }]} accommodations={[stay]} initialTab={initialTab} />);
    expect(html).toContain(`data-kind="${initialTab === "activities" ? "activity" : "accommodation"}"`);
    expect(html).not.toContain(`data-kind="${initialTab === "activities" ? "accommodation" : "activity"}"`);
  });
  it("offers recovery for a failed collection without calling it an empty catalogue", () => {
    const html = renderToStaticMarkup(<VacationPlanningClient activities={[]} accommodations={[]} activityLoadFailed initialTab="activities" />);
    expect(html).toContain("We couldn&#x27;t load activities");
    expect(html).toContain("Try again");
    expect(html).not.toContain("No activities listed yet");
  });
  it("opens the requested collection without making the visitor choose it again", () => {
    const render = (initialTab?: "activities" | "accommodations") => renderToStaticMarkup(
      <VacationPlanningClient activities={[featured]} accommodations={[]} initialTab={initialTab} />,
    );
    expect(render("activities")).toContain("Activities in Barbados");
    expect(render("accommodations")).toContain("Accommodations in Barbados");
    expect(render()).toContain("Accommodations in Barbados");
  });

  it("shows the featured experience's price and category in both responsive cards", () => {
    const cheaper = { ...featured, id: "cheaper", title: "Cheaper tour", category: "adventure", price_per_person: 50, is_featured: false };
    const html = renderToStaticMarkup(<VacationPlanningClient activities={[cheaper, { ...cheaper, id: "another" }, featured]} accommodations={[]} />);
    expect(html.match(/\$80 \/person/g)).toHaveLength(2);
    expect(html.match(/Culture/g)).toHaveLength(2);
    expect(html).not.toContain("$50 /person");
  });

  it("preserves cents and handles custom pricing", () => {
    const render = (price: number | null) => renderToStaticMarkup(<VacationPlanningClient activities={[{ ...featured, price_per_person: price }]} accommodations={[]} />);
    expect(render(80.5)).toContain("$80.5 /person");
    expect(render(null)).toContain("Flexible pricing");
  });
});
