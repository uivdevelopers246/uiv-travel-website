// Re-export types from service to maintain backwards compatibility
// The service.ts file defines the canonical types derived from the database schema
export type {
  Activity,
  ActivityStatus,
  ActivityCategory,
  CreateActivityInput,
  UpdateActivityInput,
} from "./service";

// Import constants for UI components
import type { activityCategories } from "./constants";
export type ActivityCategoryValue = (typeof activityCategories)[number]["value"];

/**
 * Activity image type for gallery display.
 */
export type ActivityImage = {
  id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
};

/**
 * UI-friendly activity type for frontend components.
 * Used for display purposes with optional vendor relationship.
 */
export type ActivityDisplay = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category: string;
  duration_hours: number | null;
  price_per_person: number | null;
  max_capacity: number | null;
  image_url: string | null;
  is_featured: boolean;
  vendors?: { name: string | null } | null;
};

/**
 * Extended activity type with full details for detail pages.
 */
export type ActivityDetail = ActivityDisplay & {
  rating: number | null;
  images?: ActivityImage[];
  vendors?: {
    id: string;
    name: string | null;
    contact_email: string | null;
    business_phone: string | null;
  } | null;
};

/** Maximum number of images allowed per activity */
export const MAX_ACTIVITY_IMAGES = 20;
