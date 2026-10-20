import type {
  ItineraryActivityCandidate,
  ItineraryPlanDraft,
  ItineraryPrefs,
  ItineraryResult,
} from "./types";

export class InvalidItineraryPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidItineraryPlanError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDateOnly(value: unknown): { value: string; time: number } | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return null;
  }

  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    return null;
  }

  return { value, time };
}

export function validateItineraryPlan(
  draft: unknown,
  prefs: ItineraryPrefs,
  candidates: ItineraryActivityCandidate[],
): ItineraryResult {
  if (!isRecord(draft) || !Array.isArray(draft.days) || draft.days.length === 0) {
    throw new InvalidItineraryPlanError("Itinerary plan must contain at least one day");
  }

  const startTime = parseDateOnly(prefs.tripStartDate)?.time;
  const endTime = parseDateOnly(prefs.tripEndDate)?.time;
  if (startTime === undefined || endTime === undefined) {
    throw new InvalidItineraryPlanError("Itinerary preferences contain invalid dates");
  }

  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const usedActivityIds = new Set<string>();
  const usedDates = new Set<string>();
  const days: ItineraryResult["days"] = [];
  let totalCents = 0;
  const budgetCents = Math.floor(prefs.budgetUsd * 100 + 1e-7);
  if (!Number.isSafeInteger(budgetCents)) {
    throw new InvalidItineraryPlanError("Activity budget is too large to calculate safely");
  }

  for (const rawDay of draft.days) {
    if (!isRecord(rawDay)) {
      throw new InvalidItineraryPlanError("Each itinerary day must be an object");
    }

    const date = parseDateOnly(rawDay.date);
    if (!date || date.time < startTime || date.time > endTime) {
      throw new InvalidItineraryPlanError("Itinerary day date is outside the trip range");
    }
    if (usedDates.has(date.value)) {
      throw new InvalidItineraryPlanError("Itinerary contains a duplicate date");
    }
    usedDates.add(date.value);

    if (typeof rawDay.theme !== "string" || rawDay.theme.trim() === "") {
      throw new InvalidItineraryPlanError("Each itinerary day needs a theme");
    }
    if (!Array.isArray(rawDay.activityIds)) {
      throw new InvalidItineraryPlanError("Each itinerary day must include activity IDs");
    }

    const activities: ItineraryResult["days"][number]["activities"] = [];
    for (const rawActivityId of rawDay.activityIds) {
      if (typeof rawActivityId !== "string") {
        throw new InvalidItineraryPlanError("Activity IDs must be strings");
      }
      if (usedActivityIds.has(rawActivityId)) {
        throw new InvalidItineraryPlanError("Itinerary contains a duplicate activity");
      }

      const candidate = candidatesById.get(rawActivityId);
      if (!candidate) {
        throw new InvalidItineraryPlanError("Itinerary contains an unknown activity ID");
      }
      if (
        typeof candidate.price_per_person !== "number" ||
        !Number.isFinite(candidate.price_per_person) ||
        candidate.price_per_person < 0
      ) {
        throw new InvalidItineraryPlanError("Selected activity is missing a valid price");
      }

      const unitPriceCents = Math.round(candidate.price_per_person * 100);
      const activityTotalCents = unitPriceCents * prefs.groupSize;
      if (!Number.isSafeInteger(activityTotalCents)) {
        throw new InvalidItineraryPlanError("Activity total is too large to calculate safely");
      }
      totalCents += activityTotalCents;
      if (!Number.isSafeInteger(totalCents) || totalCents > budgetCents) {
        throw new InvalidItineraryPlanError("Itinerary exceeds the activity budget");
      }

      usedActivityIds.add(rawActivityId);
      activities.push({
        id: candidate.id,
        title: candidate.title,
        category: candidate.category,
        duration_hours: candidate.duration_hours,
        price_per_person: candidate.price_per_person,
        location: candidate.location,
        image_url: candidate.image_url,
      });
    }

    days.push({
      date: date.value,
      theme: rawDay.theme.trim(),
      activities,
    });
  }

  if (usedActivityIds.size === 0) {
    throw new InvalidItineraryPlanError("Itinerary must recommend at least one activity");
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  return {
    tripStartDate: prefs.tripStartDate,
    tripEndDate: prefs.tripEndDate,
    estimatedTotalUsd: totalCents / 100,
    days,
    warnings: [
      "Activity availability has not been checked. Confirm availability before booking.",
    ],
  };
}

export type { ItineraryPlanDraft };
