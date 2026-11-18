import type { ItineraryPrefs } from "./types";
import { activityCategories } from "@/lib/activities/constants";
import type { ActivityCategoryValue } from "@/lib/activities/types";

type ValidatePrefsResult =
  | { ok: true; prefs: ItineraryPrefs }
  | { ok: false; error: string };

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const validCategoryValues = new Set<string>(
  activityCategories.map(({ value }) => value),
);

function parseDateOnly(value: unknown): { value: string; time: number } | null {
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) {
    return null;
  }

  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    return null;
  }

  return { value, time };
}

function isActivityCategory(value: unknown): value is ActivityCategoryValue {
  return typeof value === "string" && validCategoryValues.has(value);
}

export function validatePrefs(
  input: Record<string, unknown>,
): ValidatePrefsResult {
  const allowedKeys = new Set([
    "tripStartDate", "tripEndDate", "budgetUsd", "groupSize", "categories",
  ]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    return { ok: false, error: "Unsupported itinerary preference field" };
  }
  const start = parseDateOnly(input.tripStartDate);
  if (!start) {
    return {
      ok: false,
      error: "tripStartDate must be a valid YYYY-MM-DD date",
    };
  }

  const end = parseDateOnly(input.tripEndDate);
  if (!end) {
    return {
      ok: false,
      error: "tripEndDate must be a valid YYYY-MM-DD date",
    };
  }
  if (end.time < start.time) {
    return { ok: false, error: "tripEndDate must be on or after tripStartDate" };
  }

  const tripDays = (end.time - start.time) / DAY_MS + 1;
  if (tripDays > 14) {
    return { ok: false, error: "Trip date range must not exceed 14 days" };
  }

  const budgetUsd = input.budgetUsd;
  if (
    typeof budgetUsd !== "number" ||
    !Number.isFinite(budgetUsd) ||
    budgetUsd <= 0 ||
    !Number.isSafeInteger(Math.round(budgetUsd * 100))
  ) {
    return {
      ok: false,
      error: "budgetUsd must be a finite number greater than 0",
    };
  }

  const groupSize = input.groupSize;
  if (
    typeof groupSize !== "number" ||
    !Number.isInteger(groupSize) ||
    groupSize < 1 ||
    groupSize > 20
  ) {
    return {
      ok: false,
      error: "groupSize must be an integer between 1 and 20",
    };
  }

  const categories = input.categories;
  if (!Array.isArray(categories) || categories.length === 0) {
    return {
      ok: false,
      error: "categories must contain at least one activity category",
    };
  }

  const validatedCategories: ActivityCategoryValue[] = [];
  for (const category of categories) {
    if (!isActivityCategory(category)) {
      return {
        ok: false,
        error: "categories contains an unsupported activity category",
      };
    }
    validatedCategories.push(category);
  }

  return {
    ok: true,
    prefs: {
      tripStartDate: start.value,
      tripEndDate: end.value,
      budgetUsd,
      groupSize,
      categories: [...new Set(validatedCategories)],
    },
  };
}