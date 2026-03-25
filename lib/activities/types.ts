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
 * UI-friendly activity type for frontend components.
 * Used for display purposes with optional vendor relationship.
 */
export type ActivityDisplay = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  duration_hours: number | null;
  price_per_person: number | null;
  max_capacity: number | null;
  image_url: string | null;
  vendors?: { name: string | null } | null;
};
