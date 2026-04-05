"use client";

export const BARBADOS_CENTER = {
  latitude: 13.1939,
  longitude: -59.5432,
};

export const MAPBOX_STYLE_URL = "mapbox://styles/mapbox/outdoors-v12";

let mapboxPromise: Promise<typeof import("mapbox-gl")> | null = null;

export function getMapboxToken() {
  return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
}

export function hasMapboxToken() {
  return getMapboxToken().length > 0;
}

export function loadMapboxGl() {
  if (!mapboxPromise) {
    mapboxPromise = import("mapbox-gl");
  }

  return mapboxPromise;
}
