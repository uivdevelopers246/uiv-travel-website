import { validatePrefs } from "./validatePrefs";
import type { ItineraryRequest } from "./types";
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export function validateRequest(input: Record<string, unknown>): { ok: true; prefs: ItineraryRequest } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (input.mode !== "activities" && input.mode !== "activities_and_accommodation") return fail("Choose a valid itinerary mode");
  if (Object.keys(input).some(k => !["mode", "tripStartDate", "tripEndDate", "groupSize", "activities", "accommodation"].includes(k))) return fail("Unsupported itinerary field");
  if (!record(input.activities) || Object.keys(input.activities).some(k => !["budgetUsd", "categories"].includes(k))) return fail("Invalid activity preferences");
  const validated = validatePrefs({ tripStartDate: input.tripStartDate, tripEndDate: input.tripEndDate, groupSize: input.groupSize, ...input.activities });
  if (!validated.ok) return validated;
  const { budgetUsd, categories, ...common } = validated.prefs;
  const base = { ...common, activities: { budgetUsd, categories } };
  if (input.mode === "activities") {
    if ("accommodation" in input) return fail("Accommodation preferences are not allowed in activities mode");
    return { ok: true, prefs: { ...base, mode: "activities" } };
  }
  const stay = input.accommodation;
  if (!record(stay) || Object.keys(stay).some(k => !["budgetUsd", "checkInDate", "checkOutDate"].includes(k))) return fail("Invalid accommodation preferences");
  if (typeof stay.budgetUsd !== "number" || !Number.isFinite(stay.budgetUsd) || stay.budgetUsd <= 0 || !Number.isSafeInteger(Math.round(stay.budgetUsd * 100))) return fail("Accommodation budget must be a positive finite amount");
  if (!date(stay.checkInDate) || !date(stay.checkOutDate) || stay.checkInDate >= stay.checkOutDate || stay.checkInDate < common.tripStartDate || stay.checkOutDate > common.tripEndDate) return fail("Stay dates must be valid, within the trip, and include at least one night");
  return { ok: true, prefs: { ...base, mode: "activities_and_accommodation", accommodation: { budgetUsd: stay.budgetUsd, checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate } } };
}
