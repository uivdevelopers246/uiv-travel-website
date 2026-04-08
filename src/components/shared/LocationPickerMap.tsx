"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { hasValidCoordinates } from "@/lib/utils/geo";
import { BARBADOS_CENTER, getMapboxToken, loadMapboxGl, MAPBOX_STYLE_URL } from "./mapbox";

type CoordinateValue = {
  latitude: string;
  longitude: string;
};

type Props = {
  title: string;
  description: string;
  value: CoordinateValue;
  onChange: (value: CoordinateValue) => void;
  onClear: () => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onResolvedSearchValue?: (value: string) => void;
  searchLabel?: string;
};

type MapboxGeocodeFeature = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    full_address?: string;
    place_formatted?: string;
    name?: string;
  };
  place_name?: string;
  text?: string;
};

type MapboxGeocodeResponse = {
  features?: MapboxGeocodeFeature[];
};

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function getFeatureLabel(feature: MapboxGeocodeFeature | null | undefined) {
  if (!feature) return null;

  return (
    feature.properties?.full_address ??
    feature.properties?.place_formatted ??
    feature.place_name ??
    feature.properties?.name ??
    feature.text ??
    null
  );
}

function MapboxUnavailable({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[#d8e5f2] bg-[#f8fbfe] p-4">
      <p className="text-sm font-semibold text-[#193059]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {description} Add `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` to enable the live picker.
      </p>
    </div>
  );
}

export function LocationPickerMap({
  title,
  description,
  value,
  onChange,
  onClear,
  searchValue,
  onSearchValueChange,
  onResolvedSearchValue,
  searchLabel = "Address or place",
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof import("mapbox-gl") | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const onResolvedSearchValueRef = useRef(onResolvedSearchValue);
  const token = getMapboxToken();
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onResolvedSearchValueRef.current = onResolvedSearchValue;
  }, [onResolvedSearchValue]);

  const parsedLatitude =
    value.latitude.trim() === "" ? null : Number(value.latitude.trim());
  const parsedLongitude =
    value.longitude.trim() === "" ? null : Number(value.longitude.trim());
  const hasPin = hasValidCoordinates(parsedLatitude, parsedLongitude);

  useEffect(() => {
    if (!token || !mapContainerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;

    void loadMapboxGl().then(mapboxModule => {
      if (cancelled || !mapContainerRef.current) {
        return;
      }

      mapboxRef.current = mapboxModule;
      mapboxModule.default.accessToken = token;

      const map = new mapboxModule.default.Map({
        container: mapContainerRef.current,
        style: MAPBOX_STYLE_URL,
        center: [BARBADOS_CENTER.longitude, BARBADOS_CENTER.latitude],
        zoom: 9.2,
        attributionControl: false,
      });

      map.addControl(new mapboxModule.default.NavigationControl(), "top-right");
      map.addControl(
        new mapboxModule.default.AttributionControl({ compact: true }),
        "bottom-right",
      );
      map.on("load", () => {
        if (!cancelled) {
          setMapReady(true);
        }
      });

      map.on("click", event => {
        setAddressError(null);
        onChangeRef.current({
          latitude: formatCoordinate(event.lngLat.lat),
          longitude: formatCoordinate(event.lngLat.lng),
        });
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      setMapReady(false);
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxModule = mapboxRef.current;

    if (!map || !mapboxModule) {
      return;
    }

    if (!hasPin) {
      markerRef.current?.remove();
      markerRef.current = null;
      map.easeTo({
        center: [BARBADOS_CENTER.longitude, BARBADOS_CENTER.latitude],
        zoom: 9.2,
      });
      return;
    }

    const lngLat: [number, number] = [parsedLongitude as number, parsedLatitude as number];

    if (!markerRef.current) {
      markerRef.current = new mapboxModule.default.Marker({
        color: "#193059",
        draggable: true,
      })
        .setLngLat(lngLat)
        .addTo(map);

      markerRef.current.on("dragend", () => {
        const next = markerRef.current?.getLngLat();
        if (!next) return;

        setAddressError(null);
        onChangeRef.current({
          latitude: formatCoordinate(next.lat),
          longitude: formatCoordinate(next.lng),
        });
      });
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    map.easeTo({
      center: lngLat,
      zoom: 12.5,
    });
  }, [hasPin, parsedLatitude, parsedLongitude, mapReady]);

  useEffect(() => {
    if (!token || !hasPin) {
      return;
    }

    const controller = new AbortController();
    const reverseUrl = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
    reverseUrl.searchParams.set("longitude", String(parsedLongitude));
    reverseUrl.searchParams.set("latitude", String(parsedLatitude));
    reverseUrl.searchParams.set("access_token", token);
    reverseUrl.searchParams.set("language", "en");
    reverseUrl.searchParams.set("limit", "1");
    reverseUrl.searchParams.set("country", "BB");

    setAddressError(null);

    void fetch(reverseUrl.toString(), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          throw new Error("Unable to look up that address.");
        }

        const data = (await response.json()) as MapboxGeocodeResponse;
        const label = getFeatureLabel(data.features?.[0]);

        if (label && onResolvedSearchValueRef.current) {
          onResolvedSearchValueRef.current(label);
        }
      })
      .catch(error => {
        if (controller.signal.aborted) {
          return;
        }

        setAddressError(error instanceof Error ? error.message : "Unable to look up that address.");
      });

    return () => {
      controller.abort();
    };
  }, [hasPin, parsedLatitude, parsedLongitude, token]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      return;
    }

    setLocating(true);
    setAddressError(null);

    navigator.geolocation.getCurrentPosition(
      position => {
        onChangeRef.current({
          latitude: formatCoordinate(position.coords.latitude),
          longitude: formatCoordinate(position.coords.longitude),
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setAddressError("Unable to access your current location.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const handleFindAddress = async () => {
    if (!token) {
      return;
    }

    const query = searchValue.trim();
    if (!query) {
      setAddressError("Enter an address or place to find it on the map.");
      return;
    }

    setSearching(true);
    setAddressError(null);

    try {
      const forwardUrl = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      forwardUrl.searchParams.set("q", query);
      forwardUrl.searchParams.set("access_token", token);
      forwardUrl.searchParams.set("language", "en");
      forwardUrl.searchParams.set("limit", "1");
      forwardUrl.searchParams.set("country", "BB");

      const response = await fetch(forwardUrl.toString());
      if (!response.ok) {
        throw new Error("Unable to find that address.");
      }

      const data = (await response.json()) as MapboxGeocodeResponse;
      const feature = data.features?.[0];
      const coordinates = feature?.geometry?.coordinates;

      if (!coordinates) {
        throw new Error("No matching address was found.");
      }

      onChangeRef.current({
        latitude: formatCoordinate(coordinates[1]),
        longitude: formatCoordinate(coordinates[0]),
      });

      const label = getFeatureLabel(feature);

      if (label && onResolvedSearchValueRef.current) {
        onResolvedSearchValueRef.current(label);
      }
    } catch (error: unknown) {
      setAddressError(error instanceof Error ? error.message : "Unable to find that address.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-[#f8fbfe] p-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label className="block text-sm font-medium text-slate-700">{searchLabel}</label>
          <input
            type="text"
            value={searchValue}
            onChange={event => onSearchValueChange(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleFindAddress();
              }
            }}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#407FC2]"
            placeholder="e.g. Carlisle Bay, Bridgetown"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              void handleFindAddress();
            }}
            disabled={searching || !token}
            className="w-full rounded-full bg-[#193059] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#407FC2] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            {searching ? "Finding..." : "Find address"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-1">
        <div className="rounded-2xl border border-[#d8e5f2] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#407FC2]">
            Pin Coordinates
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {hasPin
              ? `${value.latitude}, ${value.longitude}`
              : "No pin selected yet."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="rounded-full border border-[#193059] px-4 py-2 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#193059] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {locating ? "Locating..." : "Use my current location"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-600"
        >
          Clear pin
        </button>
      </div>

      {addressError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {addressError}
        </div>
      )}

      {token ? (
        <div className="overflow-hidden rounded-2xl border border-[#d8e5f2]">
          <div ref={mapContainerRef} className="h-[320px] w-full bg-[#e7f0f7]" />
        </div>
      ) : (
        <MapboxUnavailable title={title} description={description} />
      )}

      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#193059]">
          Advanced coordinates
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Latitude</label>
            <input
              type="number"
              min="-90"
              max="90"
              step="0.000001"
              value={value.latitude}
              onChange={event =>
                onChange({
                  latitude: event.target.value,
                  longitude: value.longitude,
                })
              }
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#407FC2]"
              placeholder="13.193900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Longitude</label>
            <input
              type="number"
              min="-180"
              max="180"
              step="0.000001"
              value={value.longitude}
              onChange={event =>
                onChange({
                  latitude: value.latitude,
                  longitude: event.target.value,
                })
              }
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#407FC2]"
              placeholder="-59.543200"
            />
          </div>
        </div>
      </details>

      <p className="text-xs leading-6 text-slate-500">
        Search by address, click anywhere on the map to drop the pin, or drag the pin to fine-tune it. The address field updates automatically when a matching place is found.
      </p>
    </section>
  );
}
