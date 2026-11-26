"use client";

/* eslint-disable @next/next/no-img-element */

import { startTransition, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActivityGrid } from "@/components/activities";
import { AccommodationGrid } from "@/components/accommodations";
import { ListingMap, type ListingMapMarker } from "@/components/shared";
import { getMapboxToken } from "@/components/shared/mapbox";
import { activityCategories } from "@/lib/activities/constants";
import type { ActivityDisplay } from "@/lib/activities/types";
import { accommodationTypes } from "@/lib/accommodations/constants";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import { hasValidCoordinates } from "@/lib/utils/geo";
import { DEFAULT_IMAGE_FALLBACK, getSafeImageUrl } from "@/lib/utils/image";
import { formatAccommodationNightlyPrice } from "@/components/accommodations/pricing";
import { defaultActivityFilters, filterActivities } from "@/components/activities/filters";
import { defaultAccommodationFilters, filterAccommodations } from "@/components/accommodations/filters";

type ActiveTab = "activities" | "accommodations";
type Props = {
  activities: ActivityDisplay[];
  accommodations: AccommodationDisplay[];
  initialTab?: ActiveTab;
  activityLoadFailed?: boolean;
  accommodationLoadFailed?: boolean;
};

type ResolvedCoordinates = {
  latitude: number;
  longitude: number;
};

type MapboxGeocodeResponse = {
  features?: Array<{
    geometry?: {
      coordinates?: [number, number];
    };
  }>;
};

const categoryLabelMap = Object.fromEntries(
  activityCategories.map(category => [category.value, category.label]),
);

const accommodationTypeLabelMap = Object.fromEntries(
  accommodationTypes.map(type => [type.value, type.label]),
);

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatLabel(value: string) {
  return value
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPrice(value: number | null, suffix?: string) {
  if (value == null) {
    return "Custom pricing";
  }

  return `${currencyFormatter.format(value)}${suffix ? ` ${suffix}` : ""}`;
}

function summarizeValues(
  values: Array<string | null | undefined>,
  labelMap?: Record<string, string>,
) {
  const counts = new Map<string, number>();

  values.forEach(value => {
    if (!value) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([value]) => labelMap?.[value] ?? formatLabel(value));
}

function BrowseButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-6 py-4 text-left transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059] ${
        active
          ? "bg-[#193059] text-white shadow-[0_18px_45px_rgba(25,48,89,0.22)]"
          : "border border-[#d4e3ef] bg-white text-[#193059] hover:border-[#407FC2] hover:bg-[#f6fbff]"
      }`}
    >
      <span
        className="block text-lg font-semibold"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        {title}
      </span>
      <span
        className={`mt-1 block text-sm leading-6 ${
          active ? "text-white/78" : "text-slate-600"
        }`}
        style={{ fontFamily: "var(--font-source-sans)" }}
      >
        {description}
      </span>
    </button>
  );
}

export function VacationPlanningClient({ activities, accommodations, initialTab = "accommodations", activityLoadFailed = false, accommodationLoadFailed = false }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [activityFilters, setActivityFilters] = useState(defaultActivityFilters);
  const [accommodationFilters, setAccommodationFilters] = useState(defaultAccommodationFilters);
  const filteredActivities = useMemo(() => filterActivities(activities, activityFilters), [activities, activityFilters]);
  const filteredAccommodations = useMemo(() => filterAccommodations(accommodations, accommodationFilters), [accommodations, accommodationFilters]);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const loadFailed = activeTab === "activities" ? activityLoadFailed : accommodationLoadFailed;
  const [activityFallbackCoordinates, setActivityFallbackCoordinates] = useState<
    Record<string, ResolvedCoordinates>
  >({});
  const browseSectionRef = useRef<HTMLElement | null>(null);
  const browseHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const mapboxToken = getMapboxToken();

  const clearFilters = () => {
    if (activeTab === "accommodations") setAccommodationFilters(defaultAccommodationFilters);
    else setActivityFilters(defaultActivityFilters);
    requestAnimationFrame(() => browseHeadingRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!mapboxToken) {
      return;
    }

    const activitiesNeedingFallback = activities.filter(
      activity =>
        !hasValidCoordinates(activity.latitude, activity.longitude) &&
        Boolean(activity.location?.trim()),
    );

    if (activitiesNeedingFallback.length === 0) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    void Promise.all(
      activitiesNeedingFallback.map(async activity => {
        try {
          const searchUrl = new URL("https://api.mapbox.com/search/geocode/v6/forward");
          searchUrl.searchParams.set("q", activity.location!.trim());
          searchUrl.searchParams.set("access_token", mapboxToken);
          searchUrl.searchParams.set("country", "BB");
          searchUrl.searchParams.set("limit", "1");
          searchUrl.searchParams.set("language", "en");

          const response = await fetch(searchUrl.toString(), { signal: controller.signal });
          if (!response.ok) {
            return null;
          }

          const data = (await response.json()) as MapboxGeocodeResponse;
          const coordinates = data.features?.[0]?.geometry?.coordinates;

          if (!coordinates) {
            return null;
          }

          return {
            id: activity.id,
            latitude: coordinates[1],
            longitude: coordinates[0],
          };
        } catch {
          return null;
        }
      }),
    ).then(results => {
      if (cancelled) {
        return;
      }

      const nextCoordinates: Record<string, ResolvedCoordinates> = {};

      results.forEach(result => {
        if (!result) {
          return;
        }

        nextCoordinates[result.id] = {
          latitude: result.latitude,
          longitude: result.longitude,
        };
      });

      setActivityFallbackCoordinates(nextCoordinates);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activities, mapboxToken]);

  const featuredActivity =
    activities.find(activity => activity.is_featured) ?? activities[0] ?? null;
  const featuredAccommodation =
    accommodations.find(accommodation => accommodation.is_featured) ??
    accommodations[0] ??
    null;

  const activityStartingPrice = featuredActivity?.price_per_person ?? null;
  const featuredCategory = featuredActivity
    ? categoryLabelMap[featuredActivity.category] ?? formatLabel(featuredActivity.category)
    : "Curated experiences";

  const topStayTypes = useMemo(
    () =>
      summarizeValues(
        accommodations.map(accommodation => accommodation.accommodation_type),
        accommodationTypeLabelMap,
      ),
    [accommodations],
  );

  const heroImage = getSafeImageUrl(
    featuredAccommodation?.image_url ??
      featuredActivity?.image_url ??
      "/images/hero/BeachSunset.jpg",
    DEFAULT_IMAGE_FALLBACK,
  );

  const scrollToBrowse = (tab: ActiveTab) => {
    startTransition(() => {
      setActiveTab(tab);
    });

    requestAnimationFrame(() => {
      browseHeadingRef.current?.focus({ preventScroll: true });
      browseSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start",
      });
    });
  };

  const browseSummary =
    activeTab === "accommodations"
      ? "Find a stay for your party. Your filters also update the map above."
      : "Find an experience for your party. Your filters also update the map above.";

  const activityMapMarkers = useMemo<ListingMapMarker[]>(
    () =>
      filteredActivities
        .filter(activity => {
          const fallbackCoordinates = activityFallbackCoordinates[activity.id];

          return (
            hasValidCoordinates(activity.latitude, activity.longitude) ||
            Boolean(fallbackCoordinates)
          );
        })
        .map(activity => {
          const fallbackCoordinates = activityFallbackCoordinates[activity.id];
          const latitude = hasValidCoordinates(activity.latitude, activity.longitude)
            ? (activity.latitude as number)
            : (fallbackCoordinates as ResolvedCoordinates).latitude;
          const longitude = hasValidCoordinates(activity.latitude, activity.longitude)
            ? (activity.longitude as number)
            : (fallbackCoordinates as ResolvedCoordinates).longitude;

          return {
            id: activity.id,
            kind: "activity",
            title: activity.title,
            href: `/activities/${activity.id}`,
            latitude,
            longitude,
            imageUrl: activity.image_url,
            locationLabel: activity.location,
            detailLine: [
              activity.category ? formatLabel(activity.category) : null,
              activity.duration_hours != null ? `${activity.duration_hours} hrs` : null,
              activity.price_per_person != null
                ? formatPrice(activity.price_per_person, "per person")
                : null,
            ]
              .filter(Boolean)
              .join(" | "),
            badge: fallbackCoordinates ? "Approximate Activity" : "Activity",
          };
        }),
    [filteredActivities, activityFallbackCoordinates],
  );

  const accommodationMapMarkers = useMemo<ListingMapMarker[]>(
    () =>
      filteredAccommodations
        .filter(accommodation =>
          hasValidCoordinates(accommodation.latitude, accommodation.longitude),
        )
        .map(accommodation => ({
          id: accommodation.id,
          kind: "accommodation",
          title: accommodation.name,
          href: `/accommodations/${accommodation.id}`,
          latitude: accommodation.latitude as number,
          longitude: accommodation.longitude as number,
          imageUrl: accommodation.image_url,
          locationLabel:
            [accommodation.parish, accommodation.address].filter(Boolean).join(", ") || null,
          detailLine: [
            accommodation.accommodation_type
              ? accommodationTypeLabelMap[accommodation.accommodation_type] ??
                formatLabel(accommodation.accommodation_type)
              : null,
            accommodation.max_guest_capacity != null
              ? `${accommodation.max_guest_capacity} guests`
              : null,
            formatAccommodationNightlyPrice(accommodation),
          ]
            .filter(Boolean)
            .join(" | "),
          badge: "Accommodation",
        })),
    [filteredAccommodations],
  );

  const activeMapMarkers =
    activeTab === "accommodations" ? accommodationMapMarkers : activityMapMarkers;

  return (
    <div className="bg-[linear-gradient(180deg,#f7fbff_0%,#eef5fb_45%,#ffffff_100%)]">
      <section className="relative overflow-hidden pb-12 pt-32 [@media(max-width:1023px)_and_(max-height:500px)]:pt-28">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(251,202,26,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(64,127,194,0.18),transparent_34%)]" />

        <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
          <div className="lg:hidden">
            <h1
              className="max-w-xl text-3xl font-bold leading-tight text-[#193059] min-[360px]:text-4xl sm:text-5xl [@media(max-height:500px)]:text-3xl"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Plan where you stay and what you do in one place.
            </h1>

            <p
              className="mt-4 max-w-xl text-base leading-7 text-slate-600"
              style={{ fontFamily: "var(--font-source-sans)" }}
            >
              Explore Barbados accommodations and experiences in one place, then
              jump straight into the listings that match your trip.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <BrowseButton
                active={activeTab === "accommodations"}
                title="Browse Accommodations"
                description="Scroll to stays, prices, and filters."
                onClick={() => scrollToBrowse("accommodations")}
              />
              <BrowseButton
                active={activeTab === "activities"}
                title="Browse Activities"
                description="Jump to experiences, categories, and pricing."
                onClick={() => scrollToBrowse("activities")}
              />
            </div>

            <div className="mt-6 overflow-hidden rounded-[32px] border border-white/80 bg-white p-3 shadow-[0_28px_70px_rgba(25,48,89,0.12)]">
              <div className="relative overflow-hidden rounded-[24px]">
                <img
                  src={heroImage}
                  alt="Vacation planning in Barbados"
                  className="aspect-square w-full object-cover min-[360px]:aspect-[4/3] sm:aspect-[16/7] sm:max-h-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#193059]/84 via-[#193059]/15 to-transparent" />

                <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                  {(topStayTypes.length > 0
                    ? topStayTypes
                    : ["Villa", "Hotel", "Guesthouse"]).slice(0, 2).map(item => (
                    <span
                      key={item}
                      className="rounded-full bg-white/92 px-3 py-1 text-sm font-semibold text-[#193059]"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                <div className="absolute bottom-4 left-4 right-4">
                  <p
                    className="text-xl font-bold text-white sm:text-2xl"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    Barbados trip inspiration
                  </p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-white/80">
                    Browse stays and activities together, then dive into the one you want to plan first.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col rounded-[24px] bg-[#f4f9fd] p-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2f6da8]">
                    Featured Stay
                  </p>
                  <p
                    className="mt-2 break-words text-2xl font-bold text-[#193059]"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {featuredAccommodation?.name ?? "Barbados stays"}
                  </p>
                  <p className="mb-2 mt-2 text-sm leading-6 text-slate-600">
                    {featuredAccommodation?.parish ?? "Island-wide options"} |{" "}
                    {featuredAccommodation ? formatAccommodationNightlyPrice(featuredAccommodation) : "No available nights"}
                  </p>
                  {featuredAccommodation && (
                    <Link href={`/accommodations/${featuredAccommodation.id}`} aria-label={`View featured stay: ${featuredAccommodation.name}`}
                      className="mt-auto inline-flex min-h-11 w-fit items-center rounded-sm text-sm font-semibold text-[#193059] underline decoration-[#407FC2] underline-offset-4 hover:text-[#2f6da8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059]">
                      View stay
                    </Link>
                  )}
                </div>

                <div className="flex flex-col rounded-[24px] bg-[#193059] p-4 text-white">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#FBCA1A]">
                    Featured Activity
                  </p>
                  <p
                    className="mt-2 break-words text-2xl font-bold"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {featuredActivity?.title ?? "Island experiences"}
                  </p>
                  <p className="mb-2 mt-2 text-sm leading-6 text-white/78">
                    {featuredCategory} |{" "}
                    {activityStartingPrice != null
                      ? formatPrice(activityStartingPrice, "/person")
                      : "Flexible pricing"}
                  </p>
                  {featuredActivity && (
                    <Link href={`/activities/${featuredActivity.id}`} aria-label={`View featured activity: ${featuredActivity.title}`}
                      className="mt-auto inline-flex min-h-11 w-fit items-center rounded-sm text-sm font-semibold text-white underline decoration-white/70 underline-offset-4 hover:text-[#FBCA1A] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                      View activity
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-10 lg:grid lg:grid-cols-[1.02fr_0.98fr]">
            <div>
              <h1
                className="max-w-3xl text-5xl font-bold leading-tight text-[#193059] md:text-6xl"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Plan where you stay and what you do in one place.
              </h1>

              <p
                className="mt-5 max-w-2xl text-lg leading-8 text-slate-600"
                style={{ fontFamily: "var(--font-source-sans)" }}
              >
                Explore Barbados accommodations and experiences in one place, then
                jump straight into the listings that match your trip.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <BrowseButton
                  active={activeTab === "accommodations"}
                  title="Browse Accommodations"
                  description="Scroll to stays, prices, and filters."
                  onClick={() => scrollToBrowse("accommodations")}
                />
                <BrowseButton
                  active={activeTab === "activities"}
                  title="Browse Activities"
                  description="Jump to experiences, categories, and pricing."
                  onClick={() => scrollToBrowse("activities")}
                />
              </div>
            </div>

            <div>
              <div className="overflow-hidden rounded-[36px] border border-white/80 bg-white p-3 shadow-[0_28px_80px_rgba(25,48,89,0.14)]">
                <div className="relative overflow-hidden rounded-[28px]">
                  <img
                    src={heroImage}
                    alt="Vacation planning in Barbados"
                    className="aspect-[4/4.4] w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#193059]/82 via-[#193059]/18 to-transparent" />

                  <div className="absolute left-5 top-5 flex flex-wrap gap-2">
                    {(topStayTypes.length > 0
                      ? topStayTypes
                      : ["Villa", "Hotel", "Guesthouse"]).map(item => (
                      <span
                        key={item}
                        className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-[#193059]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  <div className="absolute bottom-5 left-5 right-5 grid gap-3 md:grid-cols-2">
                    <div className="flex flex-col rounded-[24px] border border-white/15 bg-[#193059]/75 p-5 text-white backdrop-blur-md">
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#FBCA1A]">
                        Featured Stay
                      </p>
                      <p
                        className="mt-3 line-clamp-3 break-words text-2xl font-bold"
                        style={{ fontFamily: "var(--font-playfair)" }}
                      >
                        {featuredAccommodation?.name ?? "Barbados stays"}
                      </p>
                      <p className="mb-2 mt-2 text-sm leading-6 text-white/78">
                        {featuredAccommodation?.parish ?? "Island-wide options"} |{" "}
                        {featuredAccommodation ? formatAccommodationNightlyPrice(featuredAccommodation) : "No available nights"}
                      </p>
                      {featuredAccommodation && (
                        <Link href={`/accommodations/${featuredAccommodation.id}`} aria-label={`View featured stay: ${featuredAccommodation.name}`}
                          className="mt-auto inline-flex min-h-11 w-fit items-center rounded-sm text-sm font-semibold text-white underline decoration-white/70 underline-offset-4 hover:text-[#FBCA1A] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                          View stay
                        </Link>
                      )}
                    </div>

                    <div className="flex flex-col rounded-[24px] border border-white/15 bg-[#193059]/75 p-5 text-white backdrop-blur-md">
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#FBCA1A]">
                        Featured Activity
                      </p>
                      <p
                        className="mt-3 line-clamp-3 break-words text-2xl font-bold"
                        style={{ fontFamily: "var(--font-playfair)" }}
                      >
                        {featuredActivity?.title ?? "Island experiences"}
                      </p>
                      <p className="mb-2 mt-2 text-sm leading-6 text-white/78">
                        {featuredCategory} |{" "}
                        {activityStartingPrice != null
                          ? formatPrice(activityStartingPrice, "/person")
                          : "Flexible pricing"}
                      </p>
                      {featuredActivity && (
                        <Link href={`/activities/${featuredActivity.id}`} aria-label={`View featured activity: ${featuredActivity.title}`}
                          className="mt-auto inline-flex min-h-11 w-fit items-center rounded-sm text-sm font-semibold text-white underline decoration-white/70 underline-offset-4 hover:text-[#FBCA1A] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                          View activity
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-14">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <ListingMap
            title={activeTab === "accommodations" ? "Stay Map" : "Activity Map"}
            description={
              activeTab === "accommodations"
                ? "Stays matching your current filters, where a map location is available. Compare all matching stays in the list below."
                : "Activities matching your current filters, where a map location is available. Compare all matching activities in the list below."
            }
            markers={activeMapMarkers}
            emptyMessage={
              loadFailed
                ? "Listings could not be loaded. Try again in the browse section below."
                : (activeTab === "accommodations" ? accommodations : activities).length === 0
                  ? "No listings in this collection yet. Check back soon."
                : (activeTab === "accommodations" ? filteredAccommodations : filteredActivities).length === 0
                  ? "No listings to map. Adjust or clear your filters in the browse section below."
                  : "These matching listings do not have map locations yet. You can still browse them below."
            }
          />
        </div>
      </section>

      <section id="browse-listings" ref={browseSectionRef} className="scroll-mt-32 pb-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="rounded-[36px] border border-[#d8e5f2] bg-white p-3 shadow-[0_28px_80px_rgba(25,48,89,0.08)] sm:p-6 md:p-8">
            <div className="mb-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div>
                <h2
                  ref={browseHeadingRef}
                  tabIndex={-1}
                  className="text-3xl font-bold text-[#193059] md:text-4xl"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {activeTab === "accommodations"
                    ? "Accommodations in Barbados"
                    : "Activities in Barbados"}
                </h2>
                <p
                  className="mt-4 max-w-2xl text-base leading-7 text-slate-600"
                  style={{ fontFamily: "var(--font-source-sans)" }}
                >
                  {browseSummary}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("accommodations");
                  }}
                  aria-pressed={activeTab === "accommodations"}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059] ${
                    activeTab === "accommodations"
                      ? "bg-[#193059] text-white"
                      : "border border-[#d8e5f2] bg-[#f8fbfe] text-[#193059] hover:border-[#407FC2]"
                  }`}
                  style={{ fontFamily: "var(--font-source-sans)" }}
                >
                  Accommodations
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("activities");
                  }}
                  aria-pressed={activeTab === "activities"}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059] ${
                    activeTab === "activities"
                      ? "bg-[#193059] text-white"
                      : "border border-[#d8e5f2] bg-[#f8fbfe] text-[#193059] hover:border-[#407FC2]"
                  }`}
                  style={{ fontFamily: "var(--font-source-sans)" }}
                >
                  Activities
                </button>
              </div>
            </div>

            {loadFailed ? (
              <div role="alert" className="py-12 text-center">
                <h3 className="text-2xl font-bold text-[#193059]" style={{ fontFamily: "var(--font-playfair)" }}>
                  We couldn&apos;t load {activeTab}
                </h3>
                <p className="mt-3 text-base text-slate-600">Please try again. You can also browse the other collection.</p>
                <button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}
                  className="mt-6 rounded-full bg-[#193059] px-6 py-3 font-semibold text-white hover:bg-[#2f6da8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059] disabled:cursor-wait disabled:opacity-70">
                  {refreshing ? "Trying again…" : "Try again"}
                </button>
              </div>
            ) : activeTab === "accommodations" ? (
              <AccommodationGrid accommodations={filteredAccommodations} totalCount={accommodations.length}
                filters={accommodationFilters} onFiltersChange={setAccommodationFilters}
                onClearFilters={clearFilters} showHeader={false} />
            ) : (
              <ActivityGrid activities={filteredActivities} totalCount={activities.length}
                filters={activityFilters} onFiltersChange={setActivityFilters}
                onClearFilters={clearFilters} showHeader={false} />
            )}
          </div>

        </div>
      </section>
    </div>
  );
}
