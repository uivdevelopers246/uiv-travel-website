// Re-export types from service to maintain backwards compatibility
// The service.ts file defines the canonical types derived from the database schema
export type {
  Accommodation,
  AccommodationStatus,
  CreateAccommodationInput,
  UpdateAccommodationInput,
  PublicAccommodation,
} from "./service";

/**
 * Accommodation image type for gallery display.
 */
export type AccommodationImage = {
  id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
};

/**
 * UI-friendly accommodation type for frontend components.
 * Maps database fields to more display-friendly names.
 * Note: vendor_id is omitted as it's not needed for display purposes.
 */
export type AccommodationDisplay = {
  id: string;
  name: string;
  accommodation_type: string;
  latitude?: number | null;
  longitude?: number | null;
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

/** Maximum number of images allowed per accommodation */
export const MAX_ACCOMMODATION_IMAGES = 20;
