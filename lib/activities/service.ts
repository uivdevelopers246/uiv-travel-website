import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { applyLocationPointUpdate, setLocationPointIfValid } from "@/lib/listings/service-helpers";
import {
  getCurrentUserIdOrThrow,
  getVendorIdForCurrentUser,
} from "@/lib/vendors/ownership";

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
    status?: ActivityStatus;
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

/** Activity shape exposed to public API; derived from PUBLIC_ACTIVITY_SELECT. */
export type PublicActivity = Pick<Activity, (typeof PUBLIC_ACTIVITY_SELECT)[number]>;

//-----------CREATE Functions-----------

export async function createActivity(
    supabase: SupabaseClient<Database>,
    input: CreateActivityInput
) {
    const vendorId = await getVendorIdForCurrentUser(supabase);
    
    const { data, error } = await supabase
        .from("activities")
        .insert({
            vendor_id: vendorId,
            title: input.title.trim(),
            description: input.description,
            location: input.location,
            category: input.category,
            duration_hours: input.duration_hours,
            price_per_person: input.price_per_person,
            max_capacity: input.max_capacity,
            image_url: input.image_url,
            status: input.status ?? "published",
        })
        .select("*") 
        .single();
        
    if (error) throw new Error(error.message);

    await setLocationPointIfValid(supabase, {
        entityId: data.id,
        entityParamName: "p_activity_id",
        latitude: input.latitude,
        longitude: input.longitude,
        rpcName: "set_activity_location_point",
    });
 
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

async function applyActivityLocationPoint(
    supabase: SupabaseClient<Database>,
    activityId: string,
    input: Pick<UpdateActivityInput, "latitude" | "longitude">,
) {
    await applyLocationPointUpdate(supabase, {
        entityId: activityId,
        entityParamName: "p_activity_id",
        latitude: input.latitude,
        longitude: input.longitude,
        rpcName: "set_activity_location_point",
    });
}

export async function updateActivity(
    supabase: SupabaseClient<Database>,
    activityId: string,
    input: UpdateActivityInput,
    options?: { isAdmin?: boolean }
) {
    const userId = await getCurrentUserIdOrThrow(supabase);

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

    // Admins can update any activity without vendor ownership check
    if (options?.isAdmin) {
        const { data, error } = await supabase
            .from("activities")
            .update(payload)
            .eq("id", activityId)
            .select("*")
            .single();

        if (error) throw new Error(error.message);

        await applyActivityLocationPoint(supabase, data.id, input);

        const { data: activity, error: refetchError } = await supabase
            .from("activities")
            .select("*")
            .eq("id", data.id)
            .single();
        if (refetchError) throw new Error(refetchError.message);
        return activity;
    }

    // Non-admins must own the vendor associated with the activity
    const vendorId = await getVendorIdForCurrentUser(supabase, userId);

    const { data, error } = await supabase
        .from("activities")
        .update(payload)
        .eq("id", activityId)
        .eq("vendor_id", vendorId)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await applyActivityLocationPoint(supabase, data.id, input);

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
    activityId: string,
    options?: { isAdmin?: boolean }
) {
    const userId = await getCurrentUserIdOrThrow(supabase);

    // Admins can delete any activity without vendor ownership check
    if (options?.isAdmin) {
        const { data, error } = await supabase
            .from("activities")
            .delete()
            .eq("id", activityId)
            .select("*")
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    const vendorId = await getVendorIdForCurrentUser(supabase, userId);

    const { data, error } = await supabase
        .from("activities")
        .delete()
        .eq("id", activityId)
        .eq("vendor_id", vendorId)
        .select("*")
        .single();

    if (error) throw new Error(error.message);
    return data;
}

  

