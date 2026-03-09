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
    title: string;
    description?:string | null;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    category: ActivityCategory;
    duration_hours?: number | null;
    price_per_person?: number | null;
    max_capacity?: number | null;
    image_url?: string | null;
};

export type UpdateActivityInput = Partial<
  Pick<Activity, "title" | "description" | "location" | "category" | "duration_hours" | "price_per_person" | "max_capacity" | "image_url" | "status">
> & {
    longitude?: number | null;
    latitude?: number | null;
};

/** Column names to select for public activity listings (no status, created_at, updated_at). */
export const PUBLIC_ACTIVITY_SELECT = [
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
] as const satisfies readonly (keyof Activity)[];

export function hasValidCoordinates( lat: number | null | undefined, lng: number | null | undefined): boolean {
    return (
        typeof lat === "number" &&
        typeof lng === "number" &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng < 180
    );
}

/** Activity shape exposed to public API; derived from PUBLIC_ACTIVITY_SELECT. */
export type PublicActivity = Pick<Activity, (typeof PUBLIC_ACTIVITY_SELECT)[number]>;

//-----------CREATE Functions-----------

export async function createActivity(
    supabase: SupabaseClient<Database>,
    input: CreateActivityInput
) {

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
        throw new Error("Unauthorized");
    }

    const { data: vendor, error: vendorError } = await supabase
        .from("vendors")
        .select("id")
        .eq("owner_user_id", userData.user.id)
        .maybeSingle();
    
    if (vendorError) throw new Error(vendorError.message);
    if(!vendor) {
        throw new Error("User is not associated with a vendor");
    }
    
    const { data, error } = await supabase
        .from("activities")
        .insert({
            vendor_id: vendor.id,
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

    if (hasValidCoordinates(input.latitude, input.latitude)) {
        const { error: rpcError } = await supabase.rpc("set_activity_location_point", {
            p_activity_id: data.id,
            p_lng: input.longitude as number,
            p_lat: input.latitude as number,
        });

        if (rpcError) throw new Error(rpcError.message);
    }
 
    const { data: activity, error: refetchError } = await supabase
        .from("activities")
        .select("*")
        .eq("id", data.id)
        .single()
    if (refetchError) throw new Error(refetchError.message);
    return activity;
}

export async function listActivities(
    supabase: SupabaseClient<Database>,
    options?: { limit?: number; offset?: number }
) {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    const { data, error } = await supabase
        .from("activities")
        .select(PUBLIC_ACTIVITY_SELECT.join(","))
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PublicActivity[];
}

export async function getActivityById(
    supabase: SupabaseClient<Database>,
    id: string
  ): Promise<PublicActivity | null> {
    const { data, error } = await supabase
      .from("activities")
      .select(PUBLIC_ACTIVITY_SELECT.join(","))
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
  
    if (error) throw new Error(error.message);
    return (data ?? null) as PublicActivity | null;
}

export async function updateActivity(
    supabase: SupabaseClient<Database>,
    activityId: string,
    input: UpdateActivityInput,
) {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) throw new Error("Unauthorized");

    const { data: vendor, error: vendorError } = await supabase
        .from("vendors")
        .select("id")
        .eq("owner_user_id", userData.user.id)
        .maybeSingle();
    
    if (vendorError) throw new Error(vendorError.message);
    if (!vendor) throw new Error("User is not associated with a vendor");

    const payload: Record<string, unknown> = {};
    if (input.title !== undefined) payload.title = input.title.trim();
    if (input.description !== undefined) payload.description = input.description;
    if (input.location !== undefined) payload.location = input.location;
    if (input.category !== undefined) payload.category = input.category;
    if (input.duration_hours !== undefined) payload.duration_hours = input.duration_hours;
    if (input.price_per_person !== undefined) payload.price_per_person = input.price_per_person;
    if (input.max_capacity !== undefined) payload.max_capacity = input.max_capacity;
    if (input.image_url !== undefined) payload.image_url = input.image_url;
    if (input.status !== undefined) payload.status = input.status;

    const { data, error } = await supabase
    .from("activities")
    .update(payload)
    .eq("id", activityId)
    .eq("vendor_id", vendor.id)
    .select("*")
    .single();

    if (error) throw new Error(error.message);
   
    const latPresent = input.latitude !== undefined;
    const lngPresent = input.longitude !== undefined;
    const coordsProvided = latPresent || lngPresent;

    if (coordsProvided) {
        if (input.latitude === null && input.longitude === null) {
            // Both explicitly null → clear location_point.
            const { error: rpcError } = await supabase.rpc("set_activity_location_point", {
                p_activity_id: data.id,
            });
            if (rpcError) throw new Error(rpcError.message);
        } else if (hasValidCoordinates(input.latitude, input.longitude)) {
            // Both provided and valid numbers → set location_point.
            const { error: rpcError } = await supabase.rpc("set_activity_location_point", {
                p_activity_id: data.id,
                p_lng: input.longitude as number,
                p_lat: input.latitude as number,
            });
            if (rpcError) throw new Error(rpcError.message);
        } else {
            // Mixed or invalid coordinates.
            throw new Error(
                "Provide both latitude and longitude, or both null to clear the location point."
            );
        }
    }

    const { data: activity, error: refetchError } = await supabase
        .from("activities")
        .select("*")
        .eq("id", data.id)
        .single()
    if (refetchError) throw new Error(refetchError.message);
    return activity;
}

export async function deleteActivity(
    supabase: SupabaseClient<Database>,
    activityId: string
) {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) throw new Error("Unauthorized");

    const { data: vendor, error: vendorError } = await supabase
        .from("vendors")
        .select("id")
        .eq("owner_user_id", userData.user.id)
        .maybeSingle();

    if (vendorError) throw new Error(vendorError.message);
    if (!vendor) throw new Error("User is not associated with a vendor");

    const { data, error } = await supabase
        .from("activities")
        .delete()
        .eq("id", activityId)
        .eq("vendor_id", vendor.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);
    return data;
}

  

