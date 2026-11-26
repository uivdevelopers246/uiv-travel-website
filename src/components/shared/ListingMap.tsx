"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_IMAGE_FALLBACK, getSafeImageUrl } from "@/lib/utils/image";
import { BARBADOS_CENTER, getMapboxToken, loadMapboxGl, MAPBOX_STYLE_URL } from "./mapbox";

export type ListingMapMarker = {
  id: string;
  kind: "activity" | "accommodation";
  title: string;
  href: string;
  latitude: number;
  longitude: number;
  imageUrl?: string | null;
  locationLabel?: string | null;
  detailLine?: string | null;
  badge?: string | null;
};

type Props = {
  title: string;
  description: string;
  markers: ListingMapMarker[];
  emptyMessage: string;
};

function markerPalette(kind: ListingMapMarker["kind"]) {
  return kind === "activity"
    ? {
        primary: "#FBCA1A",
        accent: "#193059",
        label: "Activity",
      }
    : {
        primary: "#193059",
        accent: "#FBCA1A",
        label: "Stay",
      };
}

function createPinMarkerElement(marker: ListingMapMarker, palette: ReturnType<typeof markerPalette>) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "button");
  button.className = "rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059]";
  button.dataset.markerId = marker.id;
  button.setAttribute("aria-label", marker.title);
  button.setAttribute("aria-pressed", "false");
  button.title = marker.title;
  button.style.padding = "4px";
  button.style.margin = "0";
  button.style.border = "0";
  button.style.background = "transparent";
  button.style.cursor = "pointer";
  button.style.filter = "drop-shadow(0 14px 24px rgba(25,48,89,0.18))";

  const visual = document.createElement("span");
  visual.dataset.pinVisual = "true";
  visual.style.display = "block";
  visual.style.transformOrigin = "bottom center";
  visual.style.transition = "transform 200ms ease";

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("width", "36");
  svg.setAttribute("height", "46");
  svg.setAttribute("viewBox", "0 0 46 58");
  svg.setAttribute("aria-hidden", "true");
  svg.style.overflow = "visible";

  const outerPath = document.createElementNS(svgNamespace, "path");
  outerPath.setAttribute(
    "d",
    "M23 2C13.6 2 6 9.42 6 18.58c0 12.68 11.52 21.7 15.74 34.22.46 1.37 2.4 1.37 2.86 0C28.82 40.28 40 31.26 40 18.58 40 9.42 32.4 2 23 2Z",
  );
  outerPath.setAttribute("fill", palette.primary);

  const innerPath = document.createElementNS(svgNamespace, "path");
  innerPath.setAttribute(
    "d",
    "M23 6.5C15.83 6.5 10 12.13 10 19.08c0 10.55 9.4 18.14 12.15 28.09.19.7 1.2.7 1.39 0C26.29 37.22 36 29.63 36 19.08 36 12.13 30.17 6.5 23 6.5Z",
  );
  innerPath.setAttribute("fill", palette.accent);

  const centerRing = document.createElementNS(svgNamespace, "circle");
  centerRing.setAttribute("cx", "23");
  centerRing.setAttribute("cy", "19");
  centerRing.setAttribute("r", "8.5");
  centerRing.setAttribute("fill", "none");
  centerRing.setAttribute("stroke", palette.primary);
  centerRing.setAttribute("stroke-width", "2.4");

  const centerDot = document.createElementNS(svgNamespace, "circle");
  centerDot.setAttribute("cx", "23");
  centerDot.setAttribute("cy", "19");
  centerDot.setAttribute("r", "2.5");
  centerDot.setAttribute("fill", palette.primary);

  svg.appendChild(outerPath);
  svg.appendChild(innerPath);
  svg.appendChild(centerRing);
  svg.appendChild(centerDot);
  visual.appendChild(svg);
  button.appendChild(visual);

  return button;
}

function MapboxUnavailable({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-[#d8e5f2] bg-[linear-gradient(180deg,#f6fbff_0%,#ebf4fb_100%)] p-6 shadow-[0_18px_55px_rgba(25,48,89,0.08)]">
      <h2 className="text-2xl font-bold text-[#193059]" style={{ fontFamily: "var(--font-playfair)" }}>
        {title}
      </h2>
      <p className="mt-3 text-lg font-semibold text-[#193059]">
        The map is unavailable right now
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
        You can still compare listings and use all filters below.
      </p>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-[#193059] px-5 py-3 text-base font-semibold text-white hover:bg-[#2f6da8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059]">
          Retry map
        </button>
      )}
    </div>
  );
}

export function ListingMap({ title, description, markers, emptyMessage }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof import("mapbox-gl") | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const boundsKeyRef = useRef<string>("");
  const token = getMapboxToken();
  const deferredMarkers = useDeferredValue(markers);
  const [selectedId, setSelectedId] = useState<string | null>(markers[0]?.id ?? null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (!token || mapFailed || !mapContainerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;
    const startupTimeout = window.setTimeout(() => {
      if (!cancelled) setMapFailed(true);
    }, 20000);

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
        zoom: 9.1,
        attributionControl: false,
      });

      map.addControl(new mapboxModule.default.NavigationControl(), "top-right");
      map.addControl(
        new mapboxModule.default.AttributionControl({ compact: true }),
        "bottom-right",
      );
      map.on("load", () => {
        if (!cancelled) {
          window.clearTimeout(startupTimeout);
          setMapReady(true);
        }
      });
      map.on("error", () => {
        if (!cancelled) setMapFailed(true);
      });
      mapRef.current = map;
    }).catch(() => {
      if (!cancelled) setMapFailed(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimeout);
      setMapReady(false);
      markerRefs.current.forEach(marker => marker.remove());
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, [token, mapFailed]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxModule = mapboxRef.current;

    if (!map || !mapboxModule) {
      return;
    }

    markerRefs.current.forEach(marker => marker.remove());
    markerRefs.current = [];

    if (deferredMarkers.length === 0) {
      map.easeTo({
        center: [BARBADOS_CENTER.longitude, BARBADOS_CENTER.latitude],
        zoom: 9.1,
      });
      boundsKeyRef.current = "";
      return;
    }

    const bounds = new mapboxModule.default.LngLatBounds();

    deferredMarkers.forEach(marker => {
      const palette = markerPalette(marker.kind);
      const button = createPinMarkerElement(marker, palette);

      button.addEventListener("click", () => {
        setSelectedId(marker.id);
      });

      button.addEventListener("mouseenter", () => {
        setSelectedId(marker.id);
      });
      button.addEventListener("focus", () => {
        setSelectedId(marker.id);
      });

      const mapMarker = new mapboxModule.default.Marker({
        element: button,
        anchor: "bottom",
      })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(map);

      markerRefs.current.push(mapMarker);
      bounds.extend([marker.longitude, marker.latitude]);
    });

    const nextBoundsKey = deferredMarkers
      .map(marker => `${marker.id}:${marker.longitude}:${marker.latitude}`)
      .join("|");

    if (nextBoundsKey !== boundsKeyRef.current) {
      if (deferredMarkers.length === 1) {
        map.easeTo({
          center: [deferredMarkers[0].longitude, deferredMarkers[0].latitude],
          zoom: 11.5,
        });
      } else {
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 11.5,
        });
      }

      boundsKeyRef.current = nextBoundsKey;
    }
  }, [deferredMarkers, mapReady]);

  const selectedMarker = useMemo(
    () => deferredMarkers.find(marker => marker.id === selectedId) ?? deferredMarkers[0] ?? null,
    [deferredMarkers, selectedId],
  );
  const activeMarkerId = selectedMarker?.id ?? null;

  useEffect(() => {
    markerRefs.current.forEach(marker => {
      const element = marker.getElement() as HTMLButtonElement;
      const visual = element.querySelector('[data-pin-visual="true"]') as HTMLSpanElement | null;
      const isActive = element.dataset.markerId === activeMarkerId;
      element.setAttribute("aria-pressed", String(isActive));
      if (visual) {
        visual.style.transform = isActive
          ? "translateY(-4px) scale(1.14)"
          : "translateY(0) scale(1)";
      }
    });
  }, [activeMarkerId, deferredMarkers, mapReady]);

  if (!token || mapFailed) {
    return <MapboxUnavailable title={title} description={description} onRetry={mapFailed ? () => setMapFailed(false) : undefined} />;
  }

  return (
    <section className="rounded-[32px] border border-[#d8e5f2] bg-white p-5 shadow-[0_28px_80px_rgba(25,48,89,0.08)] md:p-6">
      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div>
          <h2
            className="text-2xl font-bold text-[#193059]"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            {description}
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-sm font-medium text-slate-600">
            <span role="status" aria-live="polite" aria-atomic="true" className="rounded-full bg-[#eef5fb] px-3 py-2">
              {deferredMarkers.length} mapped {deferredMarkers.length === 1 ? "listing" : "listings"}
            </span>
            <span className="rounded-full bg-[#fff4cc] px-3 py-2 text-[#193059]">
              Select a pin to preview a listing
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-[#d8e5f2]">
            <div ref={mapContainerRef} role="region" aria-label={title} className="h-[340px] w-full bg-[#e7f0f7] md:h-[420px]" />
            {!mapReady && <p role="status" className="p-3 text-sm text-slate-600">Loading map…</p>}
          </div>
        </div>

        <div className="flex flex-col">
          {selectedMarker ? (
            <article className="flex h-full flex-col overflow-hidden rounded-[28px] border border-[#d8e5f2] bg-[#f8fbfe]">
              <div className="aspect-[16/10] overflow-hidden bg-slate-200">
                <img
                  src={getSafeImageUrl(selectedMarker.imageUrl ?? null, DEFAULT_IMAGE_FALLBACK)}
                  alt={selectedMarker.title}
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 break-words">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold uppercase tracking-[0.2em] ${
                      selectedMarker.kind === "activity"
                        ? "bg-[#FBCA1A] text-[#193059]"
                        : "bg-[#193059] text-white"
                    }`}
                  >
                    {selectedMarker.badge ?? markerPalette(selectedMarker.kind).label}
                  </span>
                  {selectedMarker.locationLabel && (
                    <span className="text-sm font-medium text-slate-500">
                      {selectedMarker.locationLabel}
                    </span>
                  )}
                </div>

                <h3
                  className="mt-4 break-words text-2xl font-bold text-[#193059]"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {selectedMarker.title}
                </h3>

                {selectedMarker.detailLine && (
                  <p className="mt-3 break-words text-sm leading-7 text-slate-600">
                    {selectedMarker.detailLine}
                  </p>
                )}

                <div className="mt-auto pt-6">
                  <Link
                    href={selectedMarker.href}
                    aria-label={`View ${selectedMarker.title}`}
                    className="inline-flex items-center justify-center rounded-full bg-[#193059] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2f6da8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059]"
                  >
                    View details
                  </Link>
                </div>
              </div>
            </article>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-[#d8e5f2] bg-[#f8fbfe] p-8 text-center text-slate-500">
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
