import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { hasValidCoordinates } from "@/lib/utils/geo";

type LocationPointBaseOptions = {
  entityId: string;
  latitude?: number | null;
  longitude?: number | null;
};

type LocationPointOptions = LocationPointBaseOptions &
  (
    | {
        entityParamName: "p_accommodation_id";
        rpcName: "set_accommodation_location_point";
      }
    | {
        entityParamName: "p_activity_id";
        rpcName: "set_activity_location_point";
      }
  );

const LOCATION_POINT_INPUT_ERROR =
  "Provide both latitude and longitude, or both null to clear the location point.";

async function runLocationPointRpc(
  supabase: SupabaseClient<Database>,
  options: LocationPointOptions,
) {
  if (options.latitude == null || options.longitude == null) {
    throw new Error(LOCATION_POINT_INPUT_ERROR);
  }

  const latitude = options.latitude;
  const longitude = options.longitude;

  switch (options.rpcName) {
    case "set_accommodation_location_point":
      return supabase.rpc("set_accommodation_location_point", {
        p_accommodation_id: options.entityId,
        p_lng: longitude,
        p_lat: latitude,
      });
    case "set_activity_location_point":
      return supabase.rpc("set_activity_location_point", {
        p_activity_id: options.entityId,
        p_lng: longitude,
        p_lat: latitude,
      });
  }
}

async function clearLocationPointRpc(
  supabase: SupabaseClient<Database>,
  options: LocationPointOptions,
) {
  switch (options.rpcName) {
    case "set_accommodation_location_point":
      return supabase.rpc("set_accommodation_location_point", {
        p_accommodation_id: options.entityId,
      });
    case "set_activity_location_point":
      return supabase.rpc("set_activity_location_point", {
        p_activity_id: options.entityId,
      });
  }
}

export async function setLocationPointIfValid(
  supabase: SupabaseClient<Database>,
  options: LocationPointOptions,
) {
  if (!hasValidCoordinates(options.latitude, options.longitude)) {
    return;
  }

  const { error } = await runLocationPointRpc(supabase, options);

  if (error) throw new Error(error.message);
}

export async function applyLocationPointUpdate(
  supabase: SupabaseClient<Database>,
  options: LocationPointOptions,
) {
  const latPresent = options.latitude !== undefined;
  const lngPresent = options.longitude !== undefined;

  if (!latPresent && !lngPresent) return;

  if (latPresent !== lngPresent) {
    throw new Error(LOCATION_POINT_INPUT_ERROR);
  }

  if (options.latitude === null && options.longitude === null) {
    const { error } = await clearLocationPointRpc(supabase, options);
    if (error) throw new Error(error.message);
    return;
  }

  if (!hasValidCoordinates(options.latitude, options.longitude)) {
    throw new Error(LOCATION_POINT_INPUT_ERROR);
  }

  const { error } = await runLocationPointRpc(supabase, options);
  if (error) throw new Error(error.message);
}
