import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { hasValidCoordinates } from "@/lib/utils/geo";

type LocationPointOptions = {
  entityId: string;
  entityParamName: string;
  latitude?: number | null;
  longitude?: number | null;
  rpcName: string;
};

const LOCATION_POINT_INPUT_ERROR =
  "Provide both latitude and longitude, or both null to clear the location point.";

export async function setLocationPointIfValid(
  supabase: SupabaseClient<Database>,
  options: LocationPointOptions,
) {
  if (!hasValidCoordinates(options.latitude, options.longitude)) {
    return;
  }

  const { error } = await supabase.rpc(options.rpcName, {
    [options.entityParamName]: options.entityId,
    p_lng: options.longitude,
    p_lat: options.latitude,
  });

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
    const { error } = await supabase.rpc(options.rpcName, {
      [options.entityParamName]: options.entityId,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (!hasValidCoordinates(options.latitude, options.longitude)) {
    throw new Error(LOCATION_POINT_INPUT_ERROR);
  }

  const { error } = await supabase.rpc(options.rpcName, {
    [options.entityParamName]: options.entityId,
    p_lng: options.longitude,
    p_lat: options.latitude,
  });
  if (error) throw new Error(error.message);
}
