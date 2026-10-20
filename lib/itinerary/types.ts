import type { ActivityCategoryValue } from "@/lib/activities/types"
import type { PublicActivity } from "@/lib/activities/service"

export type ItineraryPrefs = {
    tripStartDate: string;
    tripEndDate: string;
    budgetUsd: number; // total activity budget for the group
    groupSize: number;
    categories: ActivityCategoryValue[];
}

export type ItineraryPlanDraft = {
    days: {
        date: string;
        theme: string;
        activityIds: string[];
    }[];
};

export type ItineraryActivitySummary = Pick<
    PublicActivity,
    "id" | "title" | "category" | "duration_hours" |
    "price_per_person" | "location" | "image_url"
>;

export type ItineraryActivityCandidate = ItineraryActivitySummary &
    Pick<PublicActivity, "max_capacity">;

export type ItineraryResult = {
    tripStartDate: string;
    tripEndDate: string;
    estimatedTotalUsd: number;
    days: {
        date: string;
        theme: string;
        activities: ItineraryActivitySummary[];
    }[];
    warnings: string[];
};