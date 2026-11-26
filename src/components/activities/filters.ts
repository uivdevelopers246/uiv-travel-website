import type { ActivityDisplay } from "@/lib/activities/types";

export type ActivityFilterState = {
  category: string;
  maxPrice: number | null;
  duration: string;
  partySize: number | null;
};

export const defaultActivityFilters: ActivityFilterState = {
  category: "all", maxPrice: null, duration: "all", partySize: null,
};

export function filterActivities(activities: ActivityDisplay[], filters: ActivityFilterState) {
  return activities.filter(activity => {
    if (filters.category !== "all" && activity.category !== filters.category) return false;
    if (filters.maxPrice != null && (
      activity.price_per_person == null || !Number.isFinite(activity.price_per_person) ||
      activity.price_per_person > filters.maxPrice
    )) return false;
    if (filters.partySize != null && (
      activity.max_capacity == null || !Number.isFinite(activity.max_capacity) ||
      activity.max_capacity < filters.partySize
    )) return false;
    if (filters.duration !== "all") {
      const hours = activity.duration_hours;
      if (hours == null || !Number.isFinite(hours)) return false;
      if (filters.duration === "1-2" && (hours < 1 || hours > 2)) return false;
      if (filters.duration === "3-4" && (hours < 3 || hours > 4)) return false;
      if (filters.duration === "5-6" && (hours < 5 || hours > 6)) return false;
      if (filters.duration === "full-day" && hours < 7) return false;
    }
    return true;
  });
}
