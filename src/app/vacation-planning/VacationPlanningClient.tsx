"use client";

/* eslint-disable @next/next/no-img-element */

import { startTransition, useMemo, useRef, useState } from "react";
import { ActivityGrid } from "@/components/activities";
import { AccommodationGrid } from "@/components/accommodations";
import { activityCategories } from "@/lib/activities/constants";
import type { ActivityDisplay } from "@/lib/activities/types";
import { accommodationTypes, amenityOptions } from "@/lib/accommodations/constants";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import { DEFAULT_IMAGE_FALLBACK, getSafeImageUrl } from "@/lib/utils/image";

type ActiveTab = "activities" | "accommodations";

type Props = {
  activities: ActivityDisplay[];
  accommodations: AccommodationDisplay[];
};

const categoryLabelMap = Object.fromEntries(
  activityCategories.map(category => [category.value, category.label]),
);

const accommodationTypeLabelMap = Object.fromEntries(
  accommodationTypes.map(type => [type.value, type.label]),
);

const amenityLabelMap = Object.fromEntries(
  amenityOptions.map(amenity => [amenity.value, amenity.label]),
);

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatLabel(value: string) {
  return value
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStartingPrice(values: Array<number | null | undefined>) {
  const validValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (validValues.length === 0) {
    return null;
  }

  return Math.min(...validValues);
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

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-[28px] border p-5 shadow-[0_18px_55px_rgba(25,48,89,0.08)] ${
        tone === "accent"
          ? "border-[#193059] bg-[#193059] text-white"
          : "border-[#d9e7f3] bg-white text-[#193059]"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-[0.26em] ${
          tone === "accent" ? "text-[#FBCA1A]" : "text-[#407FC2]"
        }`}
        style={{ fontFamily: "var(--font-source-sans)" }}
      >
        {label}
      </p>
      <p
        className="mt-3 text-3xl font-bold"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        {value}
      </p>
    </div>
  );
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
      className={`rounded-full px-6 py-4 text-left transition-all duration-300 ${
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

function FeatureCard({
  eyebrow,
  title,
  description,
  pills,
  ctaLabel,
  onClick,
  tone = "light",
}: {
  eyebrow: string;
  title: string;
  description: string;
  pills: string[];
  ctaLabel: string;
  onClick: () => void;
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";

  return (
    <article
      className={`rounded-[32px] border p-6 shadow-[0_18px_60px_rgba(25,48,89,0.08)] md:p-7 ${
        isDark
          ? "border-[#193059] bg-[#193059] text-white"
          : "border-[#d8e5f2] bg-white text-[#193059]"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-[0.28em] ${
          isDark ? "text-[#FBCA1A]" : "text-[#407FC2]"
        }`}
        style={{ fontFamily: "var(--font-source-sans)" }}
      >
        {eyebrow}
      </p>
      <h3
        className="mt-3 text-2xl font-bold md:text-3xl"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        {title}
      </h3>
      <p
        className={`mt-4 text-base leading-7 ${
          isDark ? "text-white/80" : "text-slate-600"
        }`}
        style={{ fontFamily: "var(--font-source-sans)" }}
      >
        {description}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {pills.map(pill => (
          <span
            key={pill}
            className={`rounded-full px-3 py-2 text-sm font-medium ${
              isDark ? "bg-white/10 text-white" : "bg-[#eef5fb] text-[#193059]"
            }`}
          >
            {pill}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onClick}
        className={`mt-7 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors ${
          isDark
            ? "bg-white text-[#193059] hover:bg-[#FBCA1A]"
            : "bg-[#193059] text-white hover:bg-[#407FC2]"
        }`}
        style={{ fontFamily: "var(--font-source-sans)" }}
      >
        {ctaLabel}
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      </button>
    </article>
  );
}

export function VacationPlanningClient({ activities, accommodations }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("accommodations");
  const browseSectionRef = useRef<HTMLElement | null>(null);

  const featuredActivity = activities[0] ?? null;
  const featuredAccommodation =
    accommodations.find(accommodation => accommodation.is_featured) ??
    accommodations[0] ??
    null;

  const activityStartingPrice = useMemo(
    () => getStartingPrice(activities.map(activity => activity.price_per_person)),
    [activities],
  );

  const accommodationStartingPrice = useMemo(
    () => getStartingPrice(
      accommodations.map(accommodation => accommodation.price_min_usd),
    ),
    [accommodations],
  );

  const topCategories = useMemo(
    () => summarizeValues(activities.map(activity => activity.category), categoryLabelMap),
    [activities],
  );

  const topStayTypes = useMemo(
    () =>
      summarizeValues(
        accommodations.map(accommodation => accommodation.accommodation_type),
        accommodationTypeLabelMap,
      ),
    [accommodations],
  );

  const topAmenities = useMemo(
    () =>
      summarizeValues(
        accommodations.flatMap(accommodation => accommodation.amenities ?? []),
        amenityLabelMap,
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
      browseSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const browseSummary =
    activeTab === "accommodations"
      ? "Browse accommodations below with the existing filters and listing cards."
      : "Browse activities below with the existing filters and listing cards.";

  return (
    <div className="bg-[linear-gradient(180deg,#f7fbff_0%,#eef5fb_45%,#ffffff_100%)]">
      <section className="relative overflow-hidden pb-12 pt-32">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(251,202,26,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(64,127,194,0.18),transparent_34%)]" />

        <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
          <div className="lg:hidden">
            <span
              className="inline-flex items-center rounded-full border border-[#d8e5f2] bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#407FC2]"
              style={{ fontFamily: "var(--font-source-sans)" }}
            >
              Barbados Trip Planner
            </span>

            <h1
              className="mt-5 max-w-xl text-4xl font-bold leading-tight text-[#193059] sm:text-5xl"
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

            <div className="mt-6 overflow-hidden rounded-[32px] border border-white/80 bg-white p-3 shadow-[0_28px_70px_rgba(25,48,89,0.12)]">
              <div className="relative overflow-hidden rounded-[24px]">
                <img
                  src={heroImage}
                  alt="Vacation planning in Barbados"
                  className="aspect-[4/4.7] w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#193059]/84 via-[#193059]/15 to-transparent" />

                <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                  {(topStayTypes.length > 0
                    ? topStayTypes
                    : ["Villa", "Hotel", "Guesthouse"]).slice(0, 2).map(item => (
                    <span
                      key={item}
                      className="rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold text-[#193059]"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                <div className="absolute bottom-4 left-4 right-4">
                  <p
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    Barbados trip inspiration
                  </p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-white/80">
                    Browse stays and activities together, then dive into the one you want to plan first.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <div className="rounded-[24px] bg-[#f4f9fd] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#407FC2]">
                    Featured Stay
                  </p>
                  <p
                    className="mt-2 text-2xl font-bold text-[#193059]"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {featuredAccommodation?.name ?? "Barbados stays"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {featuredAccommodation?.parish ?? "Island-wide options"} |{" "}
                    {accommodationStartingPrice != null
                      ? formatPrice(accommodationStartingPrice, "/night")
                      : "Rates vary"}
                  </p>
                </div>

                <div className="rounded-[24px] bg-[#193059] p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#FBCA1A]">
                    Featured Activity
                  </p>
                  <p
                    className="mt-2 text-2xl font-bold"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {featuredActivity?.title ?? "Island experiences"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/78">
                    {(topCategories[0] ?? "Curated experiences")} |{" "}
                    {activityStartingPrice != null
                      ? formatPrice(activityStartingPrice, "/person")
                      : "Flexible pricing"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
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

            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatCard label="Published Stays" value={String(accommodations.length)} />
              <StatCard
                label="Published Activities"
                value={String(activities.length)}
              />
              <div className="col-span-2">
                <StatCard
                  label="Starting From"
                  value={
                    accommodationStartingPrice != null
                      ? formatPrice(accommodationStartingPrice, "/night")
                      : activityStartingPrice != null
                        ? formatPrice(activityStartingPrice, "/person")
                        : "Contact for rates"
                  }
                  tone="accent"
                />
              </div>
            </div>

            <div className="mt-5 rounded-[28px] border border-[#d8e5f2] bg-white p-5 shadow-[0_18px_45px_rgba(25,48,89,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#407FC2]">
                Travel Planning
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Choose stays or activities above, then continue into the full Barbados listings below.
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-10 lg:grid lg:grid-cols-[1.02fr_0.98fr]">
            <div>
              <span
                className="inline-flex items-center rounded-full border border-[#d8e5f2] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#407FC2]"
                style={{ fontFamily: "var(--font-source-sans)" }}
              >
                Barbados Trip Planner
              </span>

              <h1
                className="mt-6 max-w-3xl text-5xl font-bold leading-tight text-[#193059] md:text-6xl"
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

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <StatCard label="Published Stays" value={String(accommodations.length)} />
                <StatCard
                  label="Published Activities"
                  value={String(activities.length)}
                />
                <StatCard
                  label="Starting From"
                  value={
                    accommodationStartingPrice != null
                      ? formatPrice(accommodationStartingPrice, "/night")
                      : activityStartingPrice != null
                        ? formatPrice(activityStartingPrice, "/person")
                        : "Contact for rates"
                  }
                  tone="accent"
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
                        className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#193059]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  <div className="absolute bottom-5 left-5 right-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[24px] border border-white/15 bg-white/10 p-5 text-white backdrop-blur-md">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#FBCA1A]">
                        Featured Stay
                      </p>
                      <p
                        className="mt-3 text-2xl font-bold"
                        style={{ fontFamily: "var(--font-playfair)" }}
                      >
                        {featuredAccommodation?.name ?? "Barbados stays"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/78">
                        {featuredAccommodation?.parish ?? "Island-wide options"} |{" "}
                        {accommodationStartingPrice != null
                          ? formatPrice(accommodationStartingPrice, "/night")
                          : "Rates vary"}
                      </p>
                    </div>

                    <div className="rounded-[24px] border border-white/15 bg-[#193059]/75 p-5 text-white backdrop-blur-md">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#FBCA1A]">
                        Featured Activity
                      </p>
                      <p
                        className="mt-3 text-2xl font-bold"
                        style={{ fontFamily: "var(--font-playfair)" }}
                      >
                        {featuredActivity?.title ?? "Island experiences"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/78">
                        {(topCategories[0] ?? "Curated experiences")} |{" "}
                        {activityStartingPrice != null
                          ? formatPrice(activityStartingPrice, "/person")
                          : "Flexible pricing"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[28px] border border-[#d8e5f2] bg-white px-5 py-4 shadow-[0_18px_45px_rgba(25,48,89,0.12)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#407FC2]">
                  Travel Planning
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Browse one featured visual with highlights for both where to stay and what to do, then jump into the full listings below.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-14">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 lg:grid-cols-2 lg:px-8">
          <FeatureCard
            eyebrow="Accommodations"
            title="Find a stay that fits the trip."
            description="Browse villas, hotels, resorts, and guesthouses across Barbados and compare options by price, amenities, and location."
            pills={topAmenities.length > 0 ? topAmenities : ["Pool", "Beach Access", "WiFi"]}
            ctaLabel="Browse accommodations"
            onClick={() => scrollToBrowse("accommodations")}
          />
          <FeatureCard
            eyebrow="Activities"
            title="Move from interest to itinerary faster."
            description="Discover island experiences by category, budget, and vibe so you can build out the fun side of your trip."
            pills={topCategories.length > 0 ? topCategories : ["Culture", "Nature", "Adventure"]}
            ctaLabel="Browse activities"
            onClick={() => scrollToBrowse("activities")}
            tone="dark"
          />
        </div>
      </section>

      <section id="browse-listings" ref={browseSectionRef} className="scroll-mt-32 pb-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="rounded-[36px] border border-[#d8e5f2] bg-white p-6 shadow-[0_28px_80px_rgba(25,48,89,0.08)] md:p-8">
            <div className="mb-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]"
                  style={{ fontFamily: "var(--font-source-sans)" }}
                >
                  Browse Listings
                </p>
                <h2
                  className="mt-3 text-3xl font-bold text-[#193059] md:text-4xl"
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
                  onClick={() => setActiveTab("accommodations")}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition-colors ${
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
                  onClick={() => setActiveTab("activities")}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition-colors ${
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

            {activeTab === "accommodations" ? (
              <AccommodationGrid accommodations={accommodations} showHeader={false} />
            ) : (
              <ActivityGrid activities={activities} showHeader={false} />
            )}
          </div>

        </div>
      </section>
    </div>
  );
}
