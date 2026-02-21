import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { geocodeAddress } from "@/lib/geocode/service";
import type { GeocodeResult } from "@/lib/geocode/service";

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
    category: ActivityCategory;
    duration_hours?: number | null;
    price_per_person?: number | null;
    max_capacity?: number | null;
    image_url?: string | null;
};

export type UpdateActivityInput = Partial<
  Pick<Activity, "title" | "description" | "location" | "category" | "duration_hours" | "price_per_person" | "max_capacity" | "image_url" | "status">
>;

// ---- Geocoding + RPC types/helpers ----


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

    await upsertActivityGeocode(supabase, data.id, input.location ?? null);
    
    const activityId = data.id;
    if (input.location !== undefined) await upsertActivityGeocode(supabase, activityId, input.location ?? null);

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
    await upsertActivityGeocode(supabase, data.id, input.location ?? null);
    
    if (input.location !== undefined) await upsertActivityGeocode(supabase, activityId, input.location ?? null);

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

//---------- Geocoding Helpers     -------------
/**
 * -----UPSERTACTIVITYGEOCODE-----
 * The three branches in this fuction check for the three conditions of our geocoding rpc.
 * 1 - If no location is provided, we clear(default) the geocode data for this activity.
 * 2 - If the geocode service(Mapbox) does not find anything for our input location (does not
 * exist or is not specific enough) the geocode information is cleared (default).
 * 3 - If the geo object returned from the rpc call is truthy, we set the activity's location and geocode details
 * RESOLUTION - On success, error  is null or undefined and the createActivity or updateActivity function proceed.
 * On failure/error (rls blocks the update, network issue, or the function throws) error is set and that message is
 * returned to the calling function
 */                        
async function upsertActivityGeocode(
    supabase: SupabaseClient<Database>,
    activityId: string,
    location: string | null
  ) {

    if (!location || !location.trim()) {
        const { error } = await supabase.rpc("set_activity_geocode", {
            p_activity_id: activityId,
        });
        if (error) throw new Error(error.message);
        return;
    }
  
    const geo = await geocodeAddress(location);

    if (!geo) {
      const { error } = await supabase.rpc("set_activity_geocode", {
        p_activity_id: activityId,
      });
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await supabase.rpc("set_activity_geocode", {
        p_activity_id: activityId,
        p_lng: geo.lng,
        p_lat: geo.lat,
        p_quality: geo.quality,
        p_label: geo.label,
        p_feature_id: geo.featureId,
    });
    if (error) throw new Error(error.message);
  }
  

