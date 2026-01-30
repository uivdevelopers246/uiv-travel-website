import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityStatus = "draft" | "published" | "archived";
export type ActivityCategory = "water-sports" | "wildlife" | "adventure" | "culture" | "nature";

export type Activity = {
    id: string;
    vendor_id: string;

    title: string;
    description: string | null;
    location: string | null;
    category: ActivityCategory;
    duration_hours: number | null;
    price_per_person: number | null;
    max_capacity: number | null;
    rating: number | null;
    image_url: string | null;
    is_featured: boolean;

    status: ActivityStatus;
    created_at: string;
    updated_at: string;
};

export type CreateActivityInput = {
    id: string;
    vendor_id: string;

    title: string;
    description: string | null;
    location: string | null;
    category: ActivityCategory;
    duration_hours: number | null;
    price_per_person: number | null;
    max_capacity: number | null;


    image_url: string | null;
    is_featured: boolean;

    status: ActivityStatus;
    created_at: string;
    updated_at: string;
};

const baseSelect = [
    "id",
    "vendor_id",
    "title",
    "description",
    "location",
    "category",
    "duration_hours",
    "price_per_person",
    "max_capacity",
    "rating",
    "image_url",
    "is_featured",
    "status",
    "created_at",
    "updated_at",
].join(",");


  
