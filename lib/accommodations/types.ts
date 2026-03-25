// Re-export types from service to maintain backwards compatibility
// The service.ts file defines the canonical types derived from the database schema
export type {
  Accommodation,
  AccommodationStatus,
  CreateAccommodationInput,
  UpdateAccommodationInput,
  PublicAccommodation,
} from "./service";

// Import constants for UI components
import type { accommodationTypes } from "./constants";
export type AccommodationType = (typeof accommodationTypes)[number]["value"];

/**
 * UI-friendly accommodation type for frontend components.
 * Maps database fields to more display-friendly names.
 * Note: vendor_id is omitted as it's not needed for display purposes.
 */
export type AccommodationDisplay = {
  id: string;
  name: string;
  accommodation_type: string;
  bedroom_count: number | null;
  bed_count: number | null;
  bathroom_count: number | null;
  max_guest_capacity: number | null;
  price_min_usd: number | null;
  price_max_usd: number | null;
  amenities: string[];
  address: string | null;
  parish: string | null;
  image_url: string | null;
  is_featured: boolean;
  vendors?: { name: string | null } | null;
};
