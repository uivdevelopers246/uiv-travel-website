export function hasValidCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng < 180
  );
}

/**
 * Parse coordinate form strings and apply them to a payload.
 * Returns an error message if invalid, or null on success.
 */
export function applyCoordinatesToPayload(
  latText: string,
  lngText: string,
  payload: { latitude?: number | null; longitude?: number | null },
): string | null {
  const lat = latText.trim();
  const lng = lngText.trim();
  const latitude = lat === "" ? null : Number(lat);
  const longitude = lng === "" ? null : Number(lng);

  if (lat === "" && lng === "") {
    payload.latitude = null;
    payload.longitude = null;
    return null;
  }

  if (lat === "" || lng === "" || !hasValidCoordinates(latitude, longitude)) {
    return "Provide both latitude and longitude in valid ranges, or clear both.";
  }

  payload.latitude = latitude;
  payload.longitude = longitude;
  return null;
}
