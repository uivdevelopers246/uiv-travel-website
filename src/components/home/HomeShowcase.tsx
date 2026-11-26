"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { accommodationTypes } from "@/lib/accommodations/constants";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import type { ActivityDisplay } from "@/lib/activities/types";
import { DEFAULT_IMAGE_FALLBACK, getSafeImageUrl } from "@/lib/utils/image";
import { formatAccommodationNightlyPrice } from "@/components/accommodations/pricing";

const SHOWCASE_PANEL_HEIGHT = "min-h-[520px] sm:min-h-[680px]";
const META_ITEM_COUNT = 3;
const DESCRIPTION_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
};

type HomeShowcaseProps = {
  activities: ActivityDisplay[];
  accommodations: AccommodationDisplay[];
};

type ShowcaseItem = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  href: string;
  overline: string;
  badge: string;
  location: string;
  vendor: string | null;
  meta: Array<{ label: string; value: string }>;
  ctaLabel: string;
};

type ShowcasePanelProps = {
  browseHref: string;
  browseLabel: string;
  emptyDescription: string;
  items: ShowcaseItem[];
  theme: {
    border: string;
    button: string;
    surface: string;
    title: string;
  };
};

function toTitleCase(value: string) {
  return value
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ShowcasePanel({
  browseHref,
  browseLabel,
  emptyDescription,
  items,
  theme,
}: ShowcasePanelProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const currentIndex = items.length === 0 ? 0 : activeIndex % items.length;
  const activeItem = items[currentIndex];

  if (!activeItem) {
    return (
      <div
        className={`relative min-w-0 overflow-hidden rounded-3xl border ${SHOWCASE_PANEL_HEIGHT} ${theme.border} ${theme.surface} p-6 shadow-[0_30px_80px_rgba(25,48,89,0.12)] sm:rounded-[2rem] sm:p-8`}
      >
        <div className="flex min-h-[inherit] flex-col justify-between">
          <div>
            <h3
              className={`text-2xl font-bold sm:text-3xl ${theme.title}`}
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              New Barbados highlights are on the way
            </h3>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              {emptyDescription}
            </p>
          </div>
          <Link
            href={browseHref}
            className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-full px-6 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#193059] ${theme.button}`}
          >
            {browseLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <article
      aria-label={activeItem.overline}
      className={`relative min-w-0 overflow-hidden rounded-3xl border ${SHOWCASE_PANEL_HEIGHT} ${theme.border} bg-[#193059] shadow-[0_30px_80px_rgba(25,48,89,0.16)] sm:rounded-[2rem]`}
    >
      <div className="absolute inset-0">
        <Image
          src={activeItem.imageUrl}
          alt={activeItem.title}
          fill
          unoptimized
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,23,43,0.12)_0%,rgba(10,23,43,0.08)_35%,rgba(10,23,43,0.65)_70%,rgba(10,23,43,0.92)_100%)]" />
      </div>

      <div className="relative z-10 flex min-h-[inherit] flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex max-w-full rounded-full bg-[#193059]/90 px-3 py-2 text-xs font-semibold text-white">
            {activeItem.badge}
          </span>
          <span className="shrink-0 rounded-full bg-[#193059]/90 px-3 py-2 text-xs font-semibold tabular-nums text-white">
            {currentIndex + 1} of {items.length}
          </span>
        </div>

        <div className="mt-auto pt-12">
          <h3
            aria-live="polite"
            aria-atomic="true"
            className="max-w-xl text-3xl leading-tight font-bold text-white sm:text-[2.8rem] sm:leading-[1.1]"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {activeItem.title}
          </h3>
          <p className="mt-3 w-fit max-w-full rounded-full bg-[#193059]/90 px-3 py-2 text-sm leading-5 text-white">
            {activeItem.location}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Link
            href={activeItem.href}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-4 py-3 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${theme.button}`}
          >
            {activeItem.ctaLabel}
          </Link>
          {items.length > 1 && (
            <div role="group" aria-label={browseLabel} className="flex shrink-0 gap-2">
              <button
                type="button"
                aria-label="Previous listing"
                onClick={() => setActiveIndex(index => (index + items.length - 1) % items.length)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-[#193059]/90 text-white transition-colors hover:bg-[#193059] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none"
              >
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14 6-6 6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Next listing"
                onClick={() => setActiveIndex(index => (index + 1) % items.length)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-[#193059]/90 text-white transition-colors hover:bg-[#193059] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none"
              >
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m10 6 6 6-6 6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <details className="group/details mt-4 rounded-2xl bg-[#193059]/95 p-3 text-white open:p-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden">
            <span className="group-open/details:hidden">Details</span>
            <span className="hidden group-open/details:inline">Hide details</span>
            <svg aria-hidden="true" className="h-4 w-4 shrink-0 group-open/details:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="mt-4 max-h-96 overflow-y-auto pr-1 [scrollbar-color:#407FC2_#193059]">
            <p
              className="text-base leading-7 text-white/90"
              style={DESCRIPTION_CLAMP_STYLE}
            >
              {activeItem.description}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {activeItem.meta.slice(0, META_ITEM_COUNT).map(meta => (
                <div key={`${meta.label}-${meta.value}`} className="min-w-0">
                  <dt className="text-xs font-semibold text-white/80">{meta.label}</dt>
                  <dd className="mt-1 text-sm leading-5 font-semibold break-words text-white">{meta.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-white/80">Hosted by</p>
                <p className="mt-1 text-base font-semibold text-white">
                  {activeItem.vendor ?? "UnitedIV Partners"}
                </p>
              </div>
              <Link
                href={browseHref}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none"
              >
                {browseLabel}
              </Link>
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}

export function HomeShowcase({
  activities,
  accommodations,
}: HomeShowcaseProps) {
  const accommodationItems = useMemo<ShowcaseItem[]>(
    () =>
      accommodations.map(accommodation => {
        const typeLabel =
          accommodationTypes.find(
            type => type.value === accommodation.accommodation_type,
          )?.label ?? accommodation.accommodation_type;
        const location =
          accommodation.parish ?? accommodation.address ?? "Barbados";
        const meta = [
          accommodation.bedroom_count != null
            ? {
                label: "Stay",
                value: `${accommodation.bedroom_count} ${
                  accommodation.bedroom_count === 1 ? "bedroom" : "bedrooms"
                }`,
              }
            : null,
          accommodation.max_guest_capacity != null
            ? {
                label: "Capacity",
                value: `${accommodation.max_guest_capacity} guests`,
              }
            : null,
          {
            label: "Rate",
            value: formatAccommodationNightlyPrice(accommodation),
          },
        ].filter(Boolean) as Array<{ label: string; value: string }>;

        return {
          id: accommodation.id,
          title: accommodation.name,
          description:
            accommodation.amenities.length > 0
              ? `Settle into ${location} with ${accommodation.amenities.slice(0, 3).join(", ")}, plus the comfort and convenience you need for an easy island stay.`
              : `A well-placed ${typeLabel.toLowerCase()} in ${location}, ideal for travelers looking to stay close to Barbados beaches, dining, and local experiences.`,
          imageUrl: getSafeImageUrl(
            accommodation.image_url,
            DEFAULT_IMAGE_FALLBACK,
          ),
          href: `/accommodations/${accommodation.id}`,
          overline: accommodation.is_featured ? "Featured stay" : "Island stay",
          badge: typeLabel,
          location,
          vendor: accommodation.vendors?.name ?? null,
          meta,
          ctaLabel: "See stay",
        };
      }),
    [accommodations],
  );

  const activityItems = useMemo<ShowcaseItem[]>(
    () =>
      activities.map(activity => {
        const location = activity.location ?? "Barbados";
        const meta = [
          activity.duration_hours != null
            ? {
                label: "Duration",
                value: `${activity.duration_hours} hrs`,
              }
            : null,
          activity.max_capacity != null
            ? {
                label: "Group size",
                value: `Up to ${activity.max_capacity}`,
              }
            : null,
          activity.price_per_person != null
            ? {
                label: "Rate",
                value: `$${activity.price_per_person}/person`,
              }
            : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>;

        return {
          id: activity.id,
          title: activity.title,
          description:
            activity.description ??
            `Discover a locally hosted ${toTitleCase(activity.category).toLowerCase()} experience in ${location}, designed to help visitors see a more memorable side of Barbados.`,
          imageUrl: getSafeImageUrl(activity.image_url, DEFAULT_IMAGE_FALLBACK),
          href: `/activities/${activity.id}`,
          overline: activity.is_featured
            ? "Featured experience"
            : "Local experience",
          badge: toTitleCase(activity.category),
          location,
          vendor: activity.vendors?.name ?? null,
          meta,
          ctaLabel: "See activity",
        };
      }),
    [activities],
  );

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f6fbff_34%,#eef6fb_100%)] py-12 selection:bg-[#FBCA1A] selection:text-[#193059] sm:py-24">
      <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgba(251,202,26,0.14),transparent_60%)]" />
      <div className="absolute left-[-8rem] top-32 h-72 w-72 rounded-full bg-[#9ec5e8]/20 blur-3xl" />
      <div className="absolute right-[-6rem] bottom-12 h-72 w-72 rounded-full bg-[#fbca1a]/18 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="pointer-events-none absolute left-1/2 top-10 h-56 w-[min(92vw,58rem)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(251,202,26,0.24)_0%,rgba(251,202,26,0.14)_34%,rgba(251,202,26,0.06)_58%,transparent_76%)] blur-2xl" />
          <h2
            className="relative text-balance text-3xl leading-[1.1] font-bold text-[#193059] sm:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Discover where to stay and what to experience in Barbados
          </h2>
          <p
            className="relative mx-auto mt-4 max-w-2xl text-base leading-7 sm:mt-5 sm:text-lg sm:leading-8 text-slate-600"
            style={{ fontFamily: "var(--font-source-sans)" }}
          >
            Explore a curated mix of standout accommodations and locally hosted
            experiences, selected to help travelers plan a Barbados escape with
            more confidence and less guesswork.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:mt-10 sm:gap-8 xl:grid-cols-2">
          <ShowcasePanel
            browseHref="/vacation-planning?tab=accommodations#browse-listings"
            browseLabel="Browse stays"
            emptyDescription="We are curating a stronger collection of Barbados stays, from beachfront villas to guest favorites near the island's best neighborhoods."
            items={accommodationItems}
            theme={{
              border: "border-[#d7e6f4]",
              button: "bg-[#2f6da8] text-white hover:bg-[#193059]",
              surface: "bg-white/85",
              title: "text-[#193059]",
            }}
          />

          <ShowcasePanel
            browseHref="/vacation-planning?tab=activities#browse-listings"
            browseLabel="Browse activities"
            emptyDescription="New excursions, cultural outings, and on-the-water experiences are being added, with more ways to explore Barbados coming soon."
            items={activityItems}
            theme={{
              border: "border-[#d7e6f4]",
              button: "bg-[#FBCA1A] text-[#193059] hover:bg-[#e2b614]",
              surface: "bg-white/85",
              title: "text-[#193059]",
            }}
          />
        </div>
      </div>
    </section>
  );
}
