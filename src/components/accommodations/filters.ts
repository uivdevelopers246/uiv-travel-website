import type { AccommodationDisplay } from "@/lib/accommodations/types";
import { matchesAccommodationPriceRange } from "./pricing";

export type AccommodationFilterState = {
  type: string;
  bedrooms: string;
  priceRange: string;
  partySize: number | null;
};

export const defaultAccommodationFilters: AccommodationFilterState = {
  type: "all", bedrooms: "all", priceRange: "all", partySize: null,
};

export function filterAccommodations(accommodations: AccommodationDisplay[], filters: AccommodationFilterState) {
  return accommodations.filter(accommodation => {
    if (filters.type !== "all" && accommodation.accommodation_type !== filters.type) return false;
    if (filters.bedrooms !== "all") {
      const bedrooms = accommodation.bedroom_count;
      if (bedrooms == null) return false;
      if (filters.bedrooms === "4+" ? bedrooms < 4 : bedrooms !== Number(filters.bedrooms)) return false;
    }
    if (!matchesAccommodationPriceRange(accommodation.price_min_usd, filters.priceRange)) return false;
    if (filters.partySize != null && (
      accommodation.max_guest_capacity == null || !Number.isFinite(accommodation.max_guest_capacity) ||
      accommodation.max_guest_capacity < filters.partySize
    )) return false;
    return true;
  });
}
