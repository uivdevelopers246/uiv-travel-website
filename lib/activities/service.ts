// import { browserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";

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
    vendor_id: string;
    title: string;
    description?:string | null;
    location?: string | null;
    category: ActivityCategory;
    duration_hours?: number | null;
    price_per_person?: number | null;
    max_capacity?: number | null;
    image_url?: string | null;
};


//-----------CREATE Functions-----------

export async function createActivity(
    supabase: SupabaseClient<Database>,
    input: CreateActivityInput
) {
  const { data, error } = await supabase
    .from("activities")
    .insert({
        vendor_id: input.vendor_id,
        title: input.title.trim(),
        description: input.description,
        location: input.location,
        category: input.category,
        duration_hours: input.duration_hours,
        price_per_person: input.price_per_person,
        max_capacity: input.max_capacity,
        image_url: input.image_url,
    })
    .select("*") 
    .single();
    
    if (error) throw new Error(error.message);
    return data;
}








// const baseSelect = [
//     "id",
//     "vendor_id",
//     "title",
//     "description",
//     "location",
//     "category",
//     "duration_hours",
//     "price_per_person",
//     "max_capacity",
//     "rating",
//     "image_url",
//     "is_featured",
//     "status",
//     "created_at",
//     "updated_at",
// ].join(",");


  
