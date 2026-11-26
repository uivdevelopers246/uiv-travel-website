import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ActivityDisplay } from "@/lib/activities/types";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import { defaultActivityFilters, filterActivities } from "@/components/activities/filters";
import { defaultAccommodationFilters, filterAccommodations } from "@/components/accommodations/filters";
import { ActivityGrid } from "@/components/activities/ActivityGrid";
import { AccommodationGrid } from "@/components/accommodations/AccommodationGrid";
import { ActivityCard } from "@/components/activities/ActivityCard";

const activity: ActivityDisplay = {
  id: "tour", title: "Island tour", description: null, location: null, category: "culture",
  duration_hours: 2, price_per_person: 250.5, max_capacity: 60, image_url: null, is_featured: false,
};
const stay: AccommodationDisplay = {
  id: "stay", name: "Island stay", accommodation_type: "villa", bedroom_count: 4,
  bed_count: 4, bathroom_count: 2, max_guest_capacity: 24, price_min_usd: 150,
  price_max_usd: 200, amenities: [], address: null, parish: null, image_url: null, is_featured: false,
};

describe("traveler filters", () => {
  it("starts with the entire catalogue, including large groups, prices over $200 and unknown details", () => {
    const activities = [activity, { ...activity, id: "unknown", max_capacity: null, price_per_person: null }];
    const stays = [stay, { ...stay, id: "unknown", max_guest_capacity: null, price_min_usd: null }];
    expect(filterActivities(activities, defaultActivityFilters)).toEqual(activities);
    expect(filterAccommodations(stays, defaultAccommodationFilters)).toEqual(stays);
  });

  it.each([1, 4, 24])("keeps stays with room for a party of %i, including larger properties", partySize => {
    const stays = [stay, { ...stay, id: "equal", max_guest_capacity: partySize }, { ...stay, id: "small", max_guest_capacity: partySize - 1 }, { ...stay, id: "unknown", max_guest_capacity: null }];
    expect(filterAccommodations(stays, { ...defaultAccommodationFilters, partySize }).map(s => s.id)).toEqual(["stay", "equal"]);
  });

  it.each([1, 4, 60])("keeps activities with room for a party of %i", partySize => {
    const activities = [activity, { ...activity, id: "equal", max_capacity: partySize }, { ...activity, id: "small", max_capacity: partySize - 1 }, { ...activity, id: "unknown", max_capacity: null }];
    expect(filterActivities(activities, { ...defaultActivityFilters, partySize }).map(a => a.id)).toEqual(["tour", "equal"]);
  });

  it("matches an exact decimal budget and free activities without treating unknown pricing as a match", () => {
    const activities = [activity, { ...activity, id: "above", price_per_person: 250.51 }, { ...activity, id: "free", price_per_person: 0 }, { ...activity, id: "unknown", price_per_person: null }];
    expect(filterActivities(activities, { ...defaultActivityFilters, maxPrice: 250.5 }).map(a => a.id)).toEqual(["tour", "free"]);
    expect(filterActivities(activities, { ...defaultActivityFilters, maxPrice: 0 }).map(a => a.id)).toEqual(["free"]);
  });

  it("combines criteria and excludes unknown duration or bedrooms when explicitly selected", () => {
    expect(filterActivities([activity], { ...defaultActivityFilters, duration: "1-2", category: "culture", maxPrice: 251, partySize: 50 })).toEqual([activity]);
    expect(filterActivities([{ ...activity, duration_hours: null }], { ...defaultActivityFilters, duration: "1-2" })).toEqual([]);
    expect(filterActivities([activity], { ...defaultActivityFilters, category: "wildlife" })).toEqual([]);
    expect(filterAccommodations([stay], { ...defaultAccommodationFilters, bedrooms: "4+", type: "villa", priceRange: "100-200", partySize: 20 })).toEqual([stay]);
    expect(filterAccommodations([{ ...stay, bedroom_count: null }], { ...defaultAccommodationFilters, bedrooms: "4+" })).toEqual([]);
    expect(filterAccommodations([stay], { ...defaultAccommodationFilters, type: "apartment" })).toEqual([]);
  });
});

describe("listing recovery states", () => {
  it.each([
    { price: 80, label: "$80 /person" },
    { price: 80.5, label: "$80.5 /person" },
    { price: 0, label: "$0 /person" },
    { price: 1000.25, label: "$1,000.25 /person" },
  ])("preserves the displayed per-person price for $price", ({ price, label }) => {
    const html = renderToStaticMarkup(<ActivityCard activity={{ ...activity, price_per_person: price }} />);
    expect(html).toContain(label);
  });

  it.each(["activities", "accommodations"] as const)("separates an empty %s catalogue from filtered-out results", kind => {
    const render = (totalCount: number) => renderToStaticMarkup(kind === "activities"
      ? <ActivityGrid activities={[]} totalCount={totalCount} filters={defaultActivityFilters} onFiltersChange={vi.fn()} onClearFilters={vi.fn()} />
      : <AccommodationGrid accommodations={[]} totalCount={totalCount} filters={defaultAccommodationFilters} onFiltersChange={vi.fn()} onClearFilters={vi.fn()} />);
    expect(render(0)).toContain(`No ${kind} listed yet`);
    expect(render(0)).not.toContain("Clear filters");
    expect(render(6)).toContain(`No ${kind} match these filters`);
    expect(render(6)).toContain("Clear filters");
    expect(render(6)).toContain('role="status"');
    expect(render(6)).not.toContain("Notify Me");
    expect(render(6)).not.toContain("database");
  });

  it("gives every filter a native label and renders party inputs at a readable size", () => {
    const html = renderToStaticMarkup(<ActivityGrid activities={[]} totalCount={0} filters={defaultActivityFilters} onFiltersChange={vi.fn()} onClearFilters={vi.fn()} />);
    const labels = [...html.matchAll(/<label for="([^"]+)"/g)].map(match => match[1]);
    expect(labels).toHaveLength(4);
    for (const id of labels) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('placeholder="Any group size"');
    expect(html).toContain("text-base");
  });
});
