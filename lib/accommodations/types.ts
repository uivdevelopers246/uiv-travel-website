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

/**
 * Extended accommodation type with full details for detail pages.
 */
export type AccommodationDetail = AccommodationDisplay & {
  check_in_time: string | null;
  check_out_time: string | null;
  suitable_for_children: boolean;
  wheelchair_accessible: boolean;
  smoking_allowed: boolean;
  pets_allowed: boolean;
  beach_access_or_view: boolean;
  transportation_provided: boolean;
  transportation_notes: string | null;
  pickup_notes: string | null;
  images?: AccommodationImage[];
  vendors?: {
    id: string;
    name: string | null;
    contact_email: string | null;
    business_phone: string | null;
  } | null;
};

/** Maximum number of images allowed per accommodation */
export const MAX_ACCOMMODATION_IMAGES = 20;
