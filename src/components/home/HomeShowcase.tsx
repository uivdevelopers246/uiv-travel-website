"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { accommodationTypes } from "@/lib/accommodations/constants";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import type { ActivityDisplay } from "@/lib/activities/types";
import { DEFAULT_IMAGE_FALLBACK, getSafeImageUrl } from "@/lib/utils/image";

const ROTATION_INTERVAL_MS = 5000;
const SHOWCASE_PANEL_HEIGHT = "h-[640px] sm:h-[680px]";
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
    preview: string;
    surface: string;
    text: string;
    title: string;
  };
};

function formatAccommodationPrice(accommodation: AccommodationDisplay) {
  if (accommodation.price_min_usd == null) return "Price on request";

  if (
    accommodation.price_max_usd != null &&
    accommodation.price_max_usd !== accommodation.price_min_usd
  ) {
    return `$${accommodation.price_min_usd}-$${accommodation.price_max_usd}/night`;
  }

  return `$${accommodation.price_min_usd}/night`;
}

function toTitleCase(value: string) {
  return value
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function useRotatingIndex(total: number) {
  const [index, setIndex] = useState(0);
  const safeIndex = total === 0 ? 0 : index % total;

  const advance = useEffectEvent(() => {
    if (total < 2) return;
    setIndex(current => (current + 1) % total);
  });

  useEffect(() => {
    if (total < 2) return;

    const intervalId = window.setInterval(() => {
      advance();
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [total]);

  return [safeIndex, setIndex] as const;
}

function ShowcasePanel({
  browseHref,
  browseLabel,
  emptyDescription,
  items,
  theme,
}: ShowcasePanelProps) {
  const [activeIndex, setActiveIndex] = useRotatingIndex(items.length);
  const [detailsItemId, setDetailsItemId] = useState<string | null>(null);
  const activeItem = items[activeIndex];
  const detailsOpen = activeItem != null && detailsItemId === activeItem.id;

  if (!activeItem) {
    return (
      <div
        className={`relative overflow-hidden rounded-[2rem] border ${SHOWCASE_PANEL_HEIGHT} ${theme.border} ${theme.surface} p-8 shadow-[0_30px_80px_rgba(25,48,89,0.12)]`}
      >
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div>
            <p
              className={`text-sm font-semibold uppercase tracking-[0.35em] ${theme.text}`}
              style={{ fontFamily: "var(--font-source-sans)" }}
            >
              Curated Picks
            </p>
            <h3
              className={`mt-4 text-3xl font-bold ${theme.title}`}
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              New Barbados highlights are on the way
            </h3>
            <p
              className="mt-4 max-w-xl text-base leading-7 text-slate-600"
              style={{ fontFamily: "var(--font-source-sans)" }}
            >
              {emptyDescription}
            </p>
          </div>

          <div className="mt-10">
            <Link
              href={browseHref}
              className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${theme.button}`}
              style={{ fontFamily: "var(--font-source-sans)" }}
            >
              {browseLabel}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <article
      className={`relative overflow-hidden rounded-[2rem] border ${SHOWCASE_PANEL_HEIGHT} ${theme.border} bg-[#193059] shadow-[0_30px_80px_rgba(25,48,89,0.16)]`}
    >
      <div className="absolute inset-0">
        <Image
          src={activeItem.imageUrl}
          alt={activeItem.title}
          fill
          unoptimized
          className="object-cover transition duration-700"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,19,36,0.04)_0%,rgba(10,23,43,0.08)_40%,rgba(10,23,43,0.24)_72%,rgba(10,23,43,0.72)_100%)]" />
      </div>

      <div className="relative z-10 flex h-full flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.45em] text-white/72 sm:text-sm"
              style={{ fontFamily: "var(--font-source-sans)" }}
            >
              {activeItem.overline}
            </p>
            <span
              className="mt-4 inline-flex rounded-full border border-white/20 bg-white/12 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/90 backdrop-blur-sm sm:text-xs"
              style={{ fontFamily: "var(--font-source-sans)" }}
            >
              {activeItem.badge}
            </span>
          </div>

          <div className="hidden rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur-sm sm:block">
            {activeIndex + 1}/{items.length}
          </div>
        </div>

        <div className="mt-auto">
          <h3
            className="max-w-[24rem] text-[2.25rem] leading-[1.1] font-bold text-white drop-shadow-[0_10px_24px_rgba(0,0,0,0.28)] sm:text-[2.8rem]"
            style={{
              fontFamily: "var(--font-playfair)",
            }}
          >
            {activeItem.title}
          </h3>

          <div className="mt-4 inline-flex w-fit items-center rounded-full border border-white/20 bg-white/8 px-4 py-2 text-sm font-medium text-white/92 backdrop-blur-sm">
            <span
              style={{ fontFamily: "var(--font-source-sans)" }}
            >
              {activeItem.location}
            </span>
          </div>
        </div>

        <div
          className={`mt-4 mb-2 overflow-hidden rounded-[1.4rem] border border-white/16 bg-[linear-gradient(180deg,rgba(18,35,58,0.62),rgba(18,35,58,0.42))] shadow-[0_18px_42px_rgba(7,15,30,0.2)] backdrop-blur-md transition-[max-height,padding] duration-300 ${
            detailsOpen ? "max-h-[24rem] p-3.5 sm:max-h-[25rem] sm:p-4" : "max-h-[4.25rem] p-2.5"
          }`}
          onMouseEnter={() => setDetailsItemId(activeItem.id)}
          onMouseLeave={() => setDetailsItemId(null)}
          onBlur={event => {
            const nextFocused = event.relatedTarget;
            if (
              !(nextFocused instanceof Node) ||
              !event.currentTarget.contains(nextFocused)
            ) {
              setDetailsItemId(null);
            }
          }}
        >
          <button
            type="button"
            onClick={() =>
              setDetailsItemId(current =>
                current === activeItem.id ? null : activeItem.id,
              )
            }
            onFocus={() => setDetailsItemId(activeItem.id)}
            className="flex w-full items-center justify-center rounded-full border border-white/18 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/14"
            style={{ fontFamily: "var(--font-source-sans)" }}
            aria-expanded={detailsOpen}
            aria-label={`Show details for ${activeItem.title}`}
          >
            Details
          </button>

          <div
            className={`transition-all duration-200 ${
              detailsOpen
                ? "mt-3 translate-y-0 opacity-100"
                : "pointer-events-none mt-0 -translate-y-2 opacity-0"
            }`}
          >
            <p
              className="text-sm leading-6 text-white/90 sm:text-[15px]"
              style={{
                fontFamily: "var(--font-source-sans)",
                ...DESCRIPTION_CLAMP_STYLE,
              }}
            >
              {activeItem.description}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {activeItem.meta.slice(0, META_ITEM_COUNT).map(meta => (
                <div
                  key={`${meta.label}-${meta.value}`}
                  className="rounded-[1rem] border border-white/12 bg-white/8 px-3 py-2.5"
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55"
                    style={{ fontFamily: "var(--font-source-sans)" }}
                  >
                    {meta.label}
                  </p>
                  <p
                    className="mt-1.5 truncate text-[13px] font-semibold text-white sm:text-sm"
                    style={{ fontFamily: "var(--font-source-sans)" }}
                  >
                    {meta.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3.5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60"
                  style={{ fontFamily: "var(--font-source-sans)" }}
                >
                  Hosted by
                </p>
                <p
                  className="mt-1.5 max-w-[18rem] truncate text-base font-semibold text-white"
                  style={{ fontFamily: "var(--font-source-sans)" }}
                >
                  {activeItem.vendor ?? "UnitedIV Partners"}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={browseHref}
                  className="inline-flex items-center justify-center rounded-full border border-white/18 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/14"
                  style={{ fontFamily: "var(--font-source-sans)" }}
                >
                  {browseLabel}
                </Link>
                <Link
                  href={activeItem.href}
                  className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${theme.button}`}
                  style={{ fontFamily: "var(--font-source-sans)" }}
                >
                  {activeItem.ctaLabel}
                </Link>
              </div>
            </div>

            <div className="mt-3 flex gap-2.5 overflow-x-auto pt-1 pb-0.5">
              {items.map((item, itemIndex) => {
                const isActive = itemIndex === activeIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setDetailsItemId(null);
                      setActiveIndex(itemIndex);
                    }}
                    className={`min-w-[170px] rounded-[1rem] border p-2 text-left transition-all ${
                      isActive
                        ? `-translate-y-0.5 ${theme.preview} border-white/24 shadow-[0_18px_40px_rgba(15,23,42,0.22)]`
                        : "border-white/12 bg-white/6 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Image
                        src={item.imageUrl}
                        alt=""
                        width={42}
                        height={42}
                        unoptimized
                        className="h-10.5 w-10.5 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <p
                          className="truncate text-xs font-semibold text-white sm:text-[13px]"
                          style={{ fontFamily: "var(--font-source-sans)" }}
                        >
                          {item.title}
                        </p>
                        <p
                          className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55"
                          style={{ fontFamily: "var(--font-source-sans)" }}
                        >
                          {item.badge}
                        </p>
                        <p
                          className="truncate text-[10px] text-white/72"
                          style={{ fontFamily: "var(--font-source-sans)" }}
                        >
                          {item.location}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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
            value: formatAccommodationPrice(accommodation),
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
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f6fbff_34%,#eef6fb_100%)] py-20 sm:py-24">
      <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgba(251,202,26,0.14),transparent_60%)]" />
      <div className="absolute left-[-8rem] top-32 h-72 w-72 rounded-full bg-[#9ec5e8]/20 blur-3xl" />
      <div className="absolute right-[-6rem] bottom-12 h-72 w-72 rounded-full bg-[#fbca1a]/18 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="pointer-events-none absolute left-1/2 top-10 h-56 w-[min(92vw,58rem)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(251,202,26,0.24)_0%,rgba(251,202,26,0.14)_34%,rgba(251,202,26,0.06)_58%,transparent_76%)] blur-2xl" />
          <h2
            className="relative text-balance text-4xl leading-[0.96] font-bold text-[#193059] sm:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Discover where to stay and what to experience in Barbados
          </h2>
          <p
            className="relative mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600"
            style={{ fontFamily: "var(--font-source-sans)" }}
          >
            Explore a curated mix of standout accommodations and locally hosted
            experiences, selected to help travelers plan a Barbados escape with
            more confidence and less guesswork.
          </p>
        </div>

        <div className="mt-10 grid gap-8 xl:grid-cols-2">
          <ShowcasePanel
            browseHref="/vacation-planning"
            browseLabel="Browse stays"
            emptyDescription="We are curating a stronger collection of Barbados stays, from beachfront villas to guest favorites near the island's best neighborhoods."
            items={accommodationItems}
            theme={{
              border: "border-[#d7e6f4]",
              button: "bg-[#407FC2] text-white hover:bg-[#2f6da8]",
              preview: "bg-white/14",
              surface: "bg-white/85",
              text: "text-[#407FC2]",
              title: "text-[#193059]",
            }}
          />

          <ShowcasePanel
            browseHref="/vacation-planning"
            browseLabel="Browse activities"
            emptyDescription="New excursions, cultural outings, and on-the-water experiences are being added, with more ways to explore Barbados coming soon."
            items={activityItems}
            theme={{
              border: "border-[#d7e6f4]",
              button: "bg-[#FBCA1A] text-[#193059] hover:bg-[#e2b614]",
              preview: "bg-white/14",
              surface: "bg-white/85",
              text: "text-[#407FC2]",
              title: "text-[#193059]",
            }}
          />
        </div>
      </div>
    </section>
  );
}
