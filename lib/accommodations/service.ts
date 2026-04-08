import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { applyLocationPointUpdate, setLocationPointIfValid } from "@/lib/listings/service-helpers";
import { getCurrentUserIdOrThrow, getOwnedVendorIdOrThrow } from "@/lib/vendors/ownership";

export type AccommodationStatus = "draft" | "published" | "archived";

export type Accommodation = Omit<
  Database["public"]["Tables"]["accommodations"]["Row"],
  "status"
> & { status: AccommodationStatus };

export type CreateAccommodationInput = {
  name: string;
  accommodation_type: string;
  bedroom_count?: number | null;
  bed_count?: number | null;
  bathroom_count?: number | null;
  max_guest_capacity?: number | null;
  price_min_usd?: number | null;
  price_max_usd?: number | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  suitable_for_children?: boolean;
  wheelchair_accessible?: boolean;
  smoking_allowed?: boolean;
  pets_allowed?: boolean;
  beach_access_or_view?: boolean;
  transportation_provided?: boolean;
  amenities_complete?: boolean;
  amenities?: string[];
  address?: string | null;
  parish?: string | null;
  transportation_notes?: string | null;
  pickup_notes?: string | null;
  image_url?: string | null;
  status?: AccommodationStatus;
  latitude?: number | null;
  longitude?: number | null;
};

export type UpdateAccommodationInput = Partial<
  Pick<
    Accommodation,
    | "name"
    | "accommodation_type"
    | "bedroom_count"
    | "bed_count"
    | "bathroom_count"
    | "max_guest_capacity"
    | "price_min_usd"
    | "price_max_usd"
    | "check_in_time"
    | "check_out_time"
    | "suitable_for_children"
    | "wheelchair_accessible"
    | "smoking_allowed"
    | "pets_allowed"
    | "beach_access_or_view"
    | "transportation_provided"
    | "amenities_complete"
    | "amenities"
    | "address"
    | "parish"
    | "transportation_notes"
    | "pickup_notes"
    | "image_url"
    | "status"
  >
> & {
  longitude?: number | null;
  latitude?: number | null;
};

/** Column names for public accommodation listings (no status, timestamps, or location_point). */
export const PUBLIC_ACCOMMODATION_SELECT = [
  "id",
  "vendor_id",
  "name",
  "accommodation_type",
  "bedroom_count",
  "bed_count",
  "bathroom_count",
  "max_guest_capacity",
  "price_min_usd",
  "price_max_usd",
  "check_in_time",
  "check_out_time",
  "suitable_for_children",
  "wheelchair_accessible",
  "smoking_allowed",
  "pets_allowed",
  "beach_access_or_view",
  "transportation_provided",
  "amenities_complete",
  "amenities",
  "address",
  "parish",
  "transportation_notes",
  "pickup_notes",
  "image_url",
  "is_featured",
] as const satisfies readonly (keyof Accommodation)[];

export type PublicAccommodation = Pick<
  Accommodation,
  (typeof PUBLIC_ACCOMMODATION_SELECT)[number]
>;

function buildCreateInsert(
  vendorId: string,
  input: CreateAccommodationInput,
): Database["public"]["Tables"]["accommodations"]["Insert"] {
  const row: Database["public"]["Tables"]["accommodations"]["Insert"] = {
    vendor_id: vendorId,
    name: input.name.trim(),
    accommodation_type: input.accommodation_type.trim(),
  };

  if (input.bedroom_count !== undefined) row.bedroom_count = input.bedroom_count;
  if (input.bed_count !== undefined) row.bed_count = input.bed_count;
  if (input.bathroom_count !== undefined) row.bathroom_count = input.bathroom_count;
  if (input.max_guest_capacity !== undefined)
    row.max_guest_capacity = input.max_guest_capacity;
  if (input.price_min_usd !== undefined) row.price_min_usd = input.price_min_usd;
  if (input.price_max_usd !== undefined) row.price_max_usd = input.price_max_usd;
  if (input.check_in_time !== undefined) row.check_in_time = input.check_in_time;
  if (input.check_out_time !== undefined) row.check_out_time = input.check_out_time;
  if (input.suitable_for_children !== undefined)
    row.suitable_for_children = input.suitable_for_children;
  if (input.wheelchair_accessible !== undefined)
    row.wheelchair_accessible = input.wheelchair_accessible;
  if (input.smoking_allowed !== undefined) row.smoking_allowed = input.smoking_allowed;
  if (input.pets_allowed !== undefined) row.pets_allowed = input.pets_allowed;
  if (input.beach_access_or_view !== undefined)
    row.beach_access_or_view = input.beach_access_or_view;
  if (input.transportation_provided !== undefined)
    row.transportation_provided = input.transportation_provided;
  if (input.amenities_complete !== undefined)
    row.amenities_complete = input.amenities_complete;
  if (input.amenities !== undefined) row.amenities = input.amenities;
  if (input.address !== undefined) row.address = input.address;
  if (input.parish !== undefined) row.parish = input.parish;
  if (input.transportation_notes !== undefined)
    row.transportation_notes = input.transportation_notes;
  if (input.pickup_notes !== undefined) row.pickup_notes = input.pickup_notes;
  if (input.image_url !== undefined) row.image_url = input.image_url;
  if (input.status !== undefined) row.status = input.status;

  return row;
}

async function applyAccommodationLocationPoint(
  supabase: SupabaseClient<Database>,
  accommodationId: string,
  input: Pick<UpdateAccommodationInput, "latitude" | "longitude">,
) {
  await applyLocationPointUpdate(supabase, {
    entityId: accommodationId,
    entityParamName: "p_accommodation_id",
    latitude: input.latitude,
    longitude: input.longitude,
    rpcName: "set_accommodation_location_point",
  });
}

export async function createAccommodation(
  supabase: SupabaseClient<Database>,
  input: CreateAccommodationInput,
) {
  const vendorId = await getOwnedVendorIdOrThrow(supabase);

  const { data, error } = await supabase
    .from("accommodations")
    .insert(buildCreateInsert(vendorId, input))
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await setLocationPointIfValid(supabase, {
    entityId: data.id,
    entityParamName: "p_accommodation_id",
    latitude: input.latitude,
    longitude: input.longitude,
    rpcName: "set_accommodation_location_point",
  });

  const { data: accommodation, error: refetchError } = await supabase
    .from("accommodations")
    .select("*")
    .eq("id", data.id)
    .single();
  if (refetchError) throw new Error(refetchError.message);
  return accommodation as Accommodation;
}

export async function listAccommodations(
  supabase: SupabaseClient<Database>,
  options?: { limit?: number; offset?: number },
) {
  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;

  const { data, error } = await supabase
    .from("accommodations")
    .select(PUBLIC_ACCOMMODATION_SELECT.join(","))
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PublicAccommodation[];
}

export async function getAccommodationById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<PublicAccommodation | null> {
  const { data, error } = await supabase
    .from("accommodations")
    .select(PUBLIC_ACCOMMODATION_SELECT.join(","))
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as PublicAccommodation | null;
}

export async function updateAccommodation(
  supabase: SupabaseClient<Database>,
  accommodationId: string,
  input: UpdateAccommodationInput,
  options?: { isAdmin?: boolean },
) {
  const userId = await getCurrentUserIdOrThrow(supabase);

  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = (input.name as string).trim();
  if (input.accommodation_type !== undefined)
    payload.accommodation_type = (input.accommodation_type as string).trim();
  if (input.bedroom_count !== undefined) payload.bedroom_count = input.bedroom_count;
  if (input.bed_count !== undefined) payload.bed_count = input.bed_count;
  if (input.bathroom_count !== undefined) payload.bathroom_count = input.bathroom_count;
  if (input.max_guest_capacity !== undefined)
    payload.max_guest_capacity = input.max_guest_capacity;
  if (input.price_min_usd !== undefined) payload.price_min_usd = input.price_min_usd;
  if (input.price_max_usd !== undefined) payload.price_max_usd = input.price_max_usd;
  if (input.check_in_time !== undefined) payload.check_in_time = input.check_in_time;
  if (input.check_out_time !== undefined) payload.check_out_time = input.check_out_time;
  if (input.suitable_for_children !== undefined)
    payload.suitable_for_children = input.suitable_for_children;
  if (input.wheelchair_accessible !== undefined)
    payload.wheelchair_accessible = input.wheelchair_accessible;
  if (input.smoking_allowed !== undefined) payload.smoking_allowed = input.smoking_allowed;
  if (input.pets_allowed !== undefined) payload.pets_allowed = input.pets_allowed;
  if (input.beach_access_or_view !== undefined)
    payload.beach_access_or_view = input.beach_access_or_view;
  if (input.transportation_provided !== undefined)
    payload.transportation_provided = input.transportation_provided;
  if (input.amenities_complete !== undefined)
    payload.amenities_complete = input.amenities_complete;
  if (input.amenities !== undefined) payload.amenities = input.amenities;
  if (input.address !== undefined) payload.address = input.address;
  if (input.parish !== undefined) payload.parish = input.parish;
  if (input.transportation_notes !== undefined)
    payload.transportation_notes = input.transportation_notes;
  if (input.pickup_notes !== undefined) payload.pickup_notes = input.pickup_notes;
  if (input.image_url !== undefined) payload.image_url = input.image_url;
  if (input.status !== undefined) payload.status = input.status;

  if (options?.isAdmin) {
    const { data, error } = await supabase
      .from("accommodations")
      .update(payload)
      .eq("id", accommodationId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await applyAccommodationLocationPoint(supabase, data.id, input);

    const { data: accommodation, error: refetchError } = await supabase
      .from("accommodations")
      .select("*")
      .eq("id", data.id)
      .single();
    if (refetchError) throw new Error(refetchError.message);
    return accommodation as Accommodation;
  }

  const vendorId = await getOwnedVendorIdOrThrow(supabase, userId);

  const { data, error } = await supabase
    .from("accommodations")
    .update(payload)
    .eq("id", accommodationId)
    .eq("vendor_id", vendorId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await applyAccommodationLocationPoint(supabase, data.id, input);

  const { data: accommodation, error: refetchError } = await supabase
    .from("accommodations")
    .select("*")
    .eq("id", data.id)
    .single();
  if (refetchError) throw new Error(refetchError.message);
  return accommodation as Accommodation;
}

export async function deleteAccommodation(
  supabase: SupabaseClient<Database>,
  accommodationId: string,
  options?: { isAdmin?: boolean },
) {
  const userId = await getCurrentUserIdOrThrow(supabase);

  if (options?.isAdmin) {
    const { data, error } = await supabase
      .from("accommodations")
      .delete()
      .eq("id", accommodationId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as Accommodation;
  }

  const vendorId = await getOwnedVendorIdOrThrow(supabase, userId);

  const { data, error } = await supabase
    .from("accommodations")
    .delete()
    .eq("id", accommodationId)
    .eq("vendor_id", vendorId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Accommodation;
}
