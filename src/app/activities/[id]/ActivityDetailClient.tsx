"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { activityCategories } from "@/lib/activities/constants";
import type { PublicSlotWithCapacity } from "@/lib/slots/types";
import {
  buildActivityDetailLoginRedirect,
  getAddToCartSuccessMessage,
} from "./cart-helpers";
import {
  Breadcrumb,
  ImageGallery,
  ClockIcon,
  UsersIcon,
  LocationIcon,
  ListingMap,
  StarIcon,
  type GalleryImage,
} from "@/components/shared";
import { hasValidCoordinates } from "@/lib/utils/geo";

type Activity = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category: string;
  duration_hours: number | null;
  price_per_person: number | null;
  max_capacity: number | null;
  rating: number | null;
  image_url: string | null;
  is_featured: boolean;
  vendors: {
    id: string;
    name: string | null;
    contact_email: string | null;
    business_phone: string | null;
  } | null;
};

type Props = {
  activity: Activity;
  images: GalleryImage[];
};

type SlotGroup = {
  key: string;
  label: string;
  slots: PublicSlotWithCapacity[];
};

type CartMessage = {
  type: "success" | "error";
  text: string;
};

const dateGroupFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function getRemainingCapacity(slot: PublicSlotWithCapacity) {
  return slot.max_capacity - slot.off_platform_participants - slot.booked_participants;
}

function formatDateGroupLabel(iso: string) {
  return dateGroupFormatter.format(new Date(iso));
}

function formatDateGroupKey(iso: string) {
  return dateKeyFormatter.format(new Date(iso));
}

function formatTimeRange(startsAt: string, endsAt: string) {
  return `${timeFormatter.format(new Date(startsAt))} - ${timeFormatter.format(new Date(endsAt))}`;
}

function formatRemainingLabel(remaining: number) {
  return `${remaining} ${remaining === 1 ? "spot" : "spots"} left`;
}

function groupSlotsByDate(slots: PublicSlotWithCapacity[]): SlotGroup[] {
  const groups = new Map<string, SlotGroup>();
  const orderedGroups: SlotGroup[] = [];

  for (const slot of slots) {
    const key = formatDateGroupKey(slot.starts_at);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: formatDateGroupLabel(slot.starts_at),
        slots: [],
      };
      groups.set(key, group);
      orderedGroups.push(group);
    }
    group.slots.push(slot);
  }

  return orderedGroups;
}

function clampParticipants(value: number, remaining: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  const next = Math.trunc(value);
  if (remaining < 1) {
    return 1;
  }

  return Math.min(Math.max(next, 1), remaining);
}

async function fetchSlotsForActivity(activityId: string): Promise<PublicSlotWithCapacity[]> {
  const response = await fetch(`/api/activities/${activityId}/slots`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to load availability right now.",
    );
  }

  if (!Array.isArray(payload)) {
    throw new Error("Unexpected response while loading availability.");
  }

  return payload as PublicSlotWithCapacity[];
}

function redirectToLogin(activityId: string) {
  window.location.assign(buildActivityDetailLoginRedirect(activityId));
}

export function ActivityDetailClient({ activity, images }: Props) {
  const [slots, setSlots] = useState<PublicSlotWithCapacity[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [addingSlotId, setAddingSlotId] = useState<string | null>(null);
  const [cartMessage, setCartMessage] = useState<CartMessage | null>(null);
  const categoryLabel =
    activityCategories.find((c) => c.value === activity.category)?.label || activity.category;

  const allImages: GalleryImage[] = [
    ...(activity.image_url
      ? [{ id: "main", image_url: activity.image_url, alt_text: activity.title, display_order: -1 }]
      : []),
    ...images,
  ];

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Vacation Planning", href: "/vacation-planning" },
    { label: activity.title },
  ];
  const slotGroups = groupSlotsByDate(slots);

  useEffect(() => {
    let active = true;

    setSlotsLoading(true);
    setSlotsError(null);

    void (async () => {
      try {
        const nextSlots = await fetchSlotsForActivity(activity.id);
        if (!active) {
          return;
        }

        setSlots(nextSlots);
        setParticipantCounts((current) => {
          const next: Record<string, number> = {};
          for (const slot of nextSlots) {
            const remaining = getRemainingCapacity(slot);
            next[slot.id] = clampParticipants(current[slot.id] ?? 1, remaining);
          }
          return next;
        });
      } catch (error: unknown) {
        if (!active) {
          return;
        }

        setSlots([]);
        setSlotsError(
          error instanceof Error
            ? error.message
            : "Unable to load availability right now.",
        );
      } finally {
        if (active) {
          setSlotsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [activity.id, reloadToken]);

  async function handleAddToCart(slot: PublicSlotWithCapacity) {
    const remaining = getRemainingCapacity(slot);
    if (remaining < 1) {
      return;
    }

    const participants = clampParticipants(
      participantCounts[slot.id] ?? 1,
      remaining,
    );

    setAddingSlotId(slot.id);
    setCartMessage(null);

    try {
      const response = await fetch("/api/cart/lines", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slot_id: slot.id,
          participants,
        }),
      });
      if (response.status === 401) {
        redirectToLogin(activity.id);
        return;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Could not add this slot to your cart.",
        );
      }

      const mergedParticipants =
        payload && typeof payload === "object" && typeof payload.participants === "number"
          ? payload.participants
          : participants;

      setCartMessage({
        type: "success",
        text: getAddToCartSuccessMessage({
          requestedParticipants: participants,
          mergedParticipants,
          slotDateLabel: formatDateGroupLabel(slot.starts_at),
        }),
      });
    } catch (error: unknown) {
      setCartMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not add this slot to your cart.",
      });
    } finally {
      setAddingSlotId(null);
    }
  }

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />

      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef5fb_0%,#f9fcff_34%,#f4f8fc_100%)] pb-16">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(64,127,194,0.2),transparent_34%),radial-gradient(circle_at_top_right,rgba(251,202,26,0.14),transparent_26%)]" />

        <div className="relative mx-auto max-w-7xl px-4 pt-8">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <div>
              <ImageGallery
                images={allImages}
                title={activity.title}
                featuredBadge={activity.is_featured}
              />
            </div>

            <aside>
              <section className="rounded-[28px] border border-white/70 bg-white/92 p-5 shadow-[0_24px_70px_rgba(25,48,89,0.12)] backdrop-blur-sm md:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex rounded-full bg-[#407FC2]/10 px-3.5 py-1 text-xs font-semibold text-[#407FC2]">
                    {categoryLabel}
                  </span>
                  {activity.rating !== null && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-[#fff5cf] px-3 py-1 text-xs font-semibold text-[#193059]">
                      <span className="text-[#FBCA1A]">
                        <StarIcon />
                      </span>
                      {activity.rating.toFixed(1)}
                    </div>
                  )}
                </div>

                <h1
                  className="mt-4 text-[2.35rem] font-bold leading-[0.95] text-[#193059] md:text-[2.9rem]"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {activity.title}
                </h1>

                {activity.location && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    <LocationIcon />
                    <span>{activity.location}</span>
                  </div>
                )}

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                  {activity.description ||
                    "A curated Barbados experience designed for easy planning, smooth logistics, and memorable time on the water."}
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {activity.duration_hours !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[#407FC2]">
                        <ClockIcon />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Duration
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-[#193059]">
                        {activity.duration_hours} hrs
                      </p>
                    </div>
                  )}
                  {activity.max_capacity !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[#407FC2]">
                        <UsersIcon />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Group
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-[#193059]">
                        {activity.max_capacity}
                      </p>
                    </div>
                  )}
                  {activity.price_per_person !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[#407FC2]">
                        <StarIcon />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Price
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-[#193059]">
                        ${activity.price_per_person}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Overview
                    </p>
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-[#193059]">
                      {activity.duration_hours !== null
                        ? `${activity.duration_hours} hour guided experience with same-page booking.`
                        : "Choose a date, set participants, and reserve directly below."}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Group Size
                      </p>
                      <p className="mt-1.5 text-sm font-semibold text-[#193059]">
                        {activity.max_capacity !== null
                          ? `${activity.max_capacity} guests maximum`
                          : "Capacity shared after selection"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Booking
                      </p>
                      <p className="mt-1.5 text-sm font-semibold text-[#193059]">
                        Pick a slot and add it to your cart.
                      </p>
                    </div>
                  </div>
                </div>

                {activity.vendors && (
                  <div className="mt-4 rounded-[22px] border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Hosted By
                    </p>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#407FC2] to-[#193059] text-sm font-bold text-white">
                        {activity.vendors.name?.charAt(0) || "V"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#193059]">
                          {activity.vendors.name || "Vendor"}
                        </p>
                        {activity.vendors.contact_email && (
                          <p className="text-sm text-slate-500">{activity.vendors.contact_email}</p>
                        )}
                        {activity.vendors.business_phone && (
                          <p className="text-sm text-slate-500">{activity.vendors.business_phone}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-[24px] bg-[#193059] p-4 text-white shadow-[0_22px_50px_rgba(25,48,89,0.22)]">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
                        Starting From
                      </p>
                      <p className="mt-1.5 text-[2rem] font-bold leading-none">
                        {activity.price_per_person !== null
                          ? `$${activity.price_per_person}`
                          : "Price on request"}
                      </p>
                      <p className="mt-1 text-xs text-white/70">
                        {activity.price_per_person !== null ? "Per person" : "Contact the host for pricing"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/80">
                      Flexible cart booking
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      document
                        .getElementById("activity-availability")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[#FBCA1A] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#f0bf10]"
                  >
                    Check availability
                  </button>
                </div>
              </section>
            </aside>
          </div>

          <section
            id="activity-availability"
            className="mt-6 rounded-[36px] border border-[#d9e6f1] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_28px_80px_rgba(25,48,89,0.1)] md:p-8"
          >
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                  Availability
                </p>
                <h2
                  className="mt-3 text-3xl font-bold text-[#193059]"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Choose your time slot
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                  Pick a date, choose how many participants are joining, then add the slot to your cart.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="rounded-[24px] bg-[#193059] px-5 py-4 text-white shadow-[0_18px_40px_rgba(25,48,89,0.18)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">
                    Price
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {activity.price_per_person !== null
                      ? `$${activity.price_per_person} / person`
                      : "Price on request"}
                  </p>
                </div>
                <Link
                  href="/cart"
                  className="inline-flex items-center justify-center rounded-[24px] border border-[#193059] bg-white px-5 py-4 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#193059] hover:text-white"
                >
                  View cart
                </Link>
              </div>
            </div>

            {cartMessage && (
              <div
                className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                  cartMessage.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>{cartMessage.text}</span>
                  {cartMessage.type === "success" ? (
                    <Link
                      href="/cart"
                      className="inline-flex items-center justify-center rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                    >
                      Review cart and checkout
                    </Link>
                  ) : null}
                </div>
              </div>
            )}

            {slotsLoading ? (
              <div className="mt-6 rounded-[28px] border border-[#d8e5f2] bg-white px-5 py-7 text-sm text-slate-600">
                Loading available slots...
              </div>
            ) : slotsError ? (
              <div className="mt-6 rounded-[28px] border border-rose-200 bg-rose-50 p-5">
                <p className="text-sm text-rose-700">{slotsError}</p>
                <button
                  type="button"
                  onClick={() => setReloadToken((value) => value + 1)}
                  className="mt-3 inline-flex rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                >
                  Retry
                </button>
              </div>
            ) : slotGroups.length === 0 ? (
              <div className="mt-6 rounded-[28px] border border-[#d8e5f2] bg-white px-5 py-7 text-sm text-slate-600">
                No upcoming slots are available right now.
              </div>
            ) : (
              <div className="mt-8 space-y-8">
                {slotGroups.map((group) => (
                  <div key={group.key}>
                    <div className="flex items-center gap-3">
                      <span className="h-10 w-1 rounded-full bg-[#FBCA1A]" />
                      <h3
                        className="text-2xl font-bold text-[#193059]"
                        style={{ fontFamily: "var(--font-playfair)" }}
                      >
                        {group.label}
                      </h3>
                    </div>

                    <div className="mt-4 grid gap-4">
                      {group.slots.map((slot) => {
                        const remaining = getRemainingCapacity(slot);
                        const isSoldOut = remaining < 1;
                        const participants = clampParticipants(
                          participantCounts[slot.id] ?? 1,
                          remaining,
                        );
                        const isSubmitting = addingSlotId === slot.id;

                        return (
                          <article
                            key={slot.id}
                            className="rounded-[28px] border border-[#d8e5f2] bg-white p-5 shadow-[0_18px_45px_rgba(25,48,89,0.06)]"
                          >
                            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                              <div className="min-w-0 space-y-3">
                                <div className="flex flex-wrap items-center gap-3">
                                  <p className="text-2xl font-bold text-[#193059]">
                                    {formatTimeRange(slot.starts_at, slot.ends_at)}
                                  </p>
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                                      isSoldOut
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    {isSoldOut ? "Sold Out" : formatRemainingLabel(remaining)}
                                  </span>
                                </div>

                                <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                                  <p className="rounded-2xl bg-[#f5f9fc] px-4 py-3">
                                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                      Time Window
                                    </span>
                                    <span className="mt-2 block font-medium text-[#193059]">
                                      <time dateTime={slot.starts_at}>
                                        Starts {timeFormatter.format(new Date(slot.starts_at))}
                                      </time>
                                      {"  "}
                                      <time dateTime={slot.ends_at}>
                                        Ends {timeFormatter.format(new Date(slot.ends_at))}
                                      </time>
                                    </span>
                                  </p>

                                  <p className="rounded-2xl bg-[#f5f9fc] px-4 py-3">
                                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                      Capacity
                                    </span>
                                    <span className="mt-2 block font-medium text-[#193059]">
                                      {remaining} of {slot.max_capacity} spots remain
                                    </span>
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-[minmax(0,150px)_minmax(0,190px)] sm:items-end">
                                <label className="block">
                                  <span className="mb-2 block text-sm font-semibold text-[#193059]">
                                    Participants
                                  </span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={Math.max(1, remaining)}
                                    step={1}
                                    value={participants}
                                    disabled={isSoldOut || isSubmitting}
                                    onChange={(event) => {
                                      const nextParticipants = clampParticipants(
                                        event.currentTarget.valueAsNumber,
                                        remaining,
                                      );
                                      setCartMessage(null);
                                      setParticipantCounts((current) => ({
                                        ...current,
                                        [slot.id]: nextParticipants,
                                      }));
                                    }}
                                    className="w-full rounded-2xl border border-[#c8d9ea] bg-white px-4 py-3 text-[#193059] outline-none transition-colors focus:border-[#407FC2] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => void handleAddToCart(slot)}
                                  disabled={isSoldOut || isSubmitting}
                                  className="rounded-2xl bg-[#193059] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#407FC2] disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {isSoldOut
                                    ? "Sold Out"
                                    : isSubmitting
                                      ? "Adding..."
                                      : "Add to cart"}
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      {hasValidCoordinates(activity.latitude, activity.longitude) && (
        <section className="bg-[#f4f8fc] pb-16">
          <div className="container mx-auto max-w-7xl px-4">
            <ListingMap
              title="Activity Map"
              description="This activity has a saved map pin, so guests can preview where the experience is based before booking."
              markers={[
                {
                  id: activity.id,
                  kind: "activity",
                  title: activity.title,
                  href: `/activities/${activity.id}`,
                  latitude: activity.latitude as number,
                  longitude: activity.longitude as number,
                  imageUrl: activity.image_url,
                  locationLabel: activity.location,
                  detailLine: activity.description ?? categoryLabel,
                  badge: categoryLabel,
                },
              ]}
              emptyMessage="This activity does not have a saved map location yet."
            />
          </div>
        </section>
      )}
    </>
  );
}
