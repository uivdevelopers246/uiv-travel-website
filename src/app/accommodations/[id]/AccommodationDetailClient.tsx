"use client";

import { accommodationTypes, amenityOptions } from "@/lib/accommodations/constants";
import {
  Breadcrumb,
  ImageGallery,
  HomeIcon,
  BathIcon,
  BedIcon,
  UsersIcon,
  LocationIcon,
  ListingMap,
  CheckIcon,
  XIcon,
  type GalleryImage,
} from "@/components/shared";
import { hasValidCoordinates } from "@/lib/utils/geo";
import { AccommodationBookingForm } from "./AccommodationBookingForm";
import type { StaySelection } from "./booking-helpers";
import { formatAccommodationNightlyPrice } from "@/components/accommodations/pricing";

type Accommodation = {
  id: string;
  name: string;
  accommodation_type: string;
  latitude?: number | null;
  longitude?: number | null;
  bedroom_count: number | null;
  bed_count: number | null;
  bathroom_count: number | null;
  max_guest_capacity: number | null;
  price_min_usd: number | null;
  price_max_usd: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  suitable_for_children: boolean;
  wheelchair_accessible: boolean;
  smoking_allowed: boolean;
  pets_allowed: boolean;
  beach_access_or_view: boolean;
  transportation_provided: boolean;
  amenities: string[];
  address: string | null;
  parish: string | null;
  transportation_notes: string | null;
  pickup_notes: string | null;
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
  accommodation: Accommodation;
  images: GalleryImage[];
  initialSelection?: StaySelection;
};

function formatPhoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function AccommodationDetailClient({ accommodation, images, initialSelection }: Props) {
  const typeLabel =
    accommodationTypes.find((t) => t.value === accommodation.accommodation_type)?.label ||
    accommodation.accommodation_type;

  const allImages: GalleryImage[] = [
    ...(accommodation.image_url
      ? [{ id: "main", image_url: accommodation.image_url, alt_text: accommodation.name, display_order: -1 }]
      : []),
    ...images,
  ];

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Vacation Planning", href: "/vacation-planning" },
    { label: accommodation.name },
  ];

  const getAmenityLabel = (value: string) => {
    return amenityOptions.find((a) => a.value === value)?.label || value;
  };

  const policies = [
    { key: "children", label: "Children welcome", value: accommodation.suitable_for_children },
    { key: "pets", label: "Pets allowed", value: accommodation.pets_allowed },
    { key: "smoking", label: "Smoking allowed", value: accommodation.smoking_allowed },
    { key: "wheelchair", label: "Wheelchair accessible", value: accommodation.wheelchair_accessible },
    { key: "beach", label: "Beach access or view", value: accommodation.beach_access_or_view },
    { key: "transport", label: "Transportation provided", value: accommodation.transportation_provided },
  ];

  const positivePolicies = policies.filter((policy) => policy.value);
  const stayHighlights = [
    accommodation.max_guest_capacity !== null
      ? `Designed for up to ${accommodation.max_guest_capacity} guests`
      : null,
    accommodation.check_in_time ? `Check-in from ${accommodation.check_in_time}` : null,
    accommodation.check_out_time ? `Checkout by ${accommodation.check_out_time}` : null,
    accommodation.beach_access_or_view ? "Includes beach access or a water-facing setting" : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />

      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef5fb_0%,#f9fcff_34%,#f4f8fc_100%)] pb-8 sm:pb-16">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(64,127,194,0.2),transparent_34%),radial-gradient(circle_at_top_right,rgba(251,202,26,0.14),transparent_26%)]" />

        <div className="relative mx-auto max-w-7xl px-4 pt-4 sm:pt-8">
          <div className="grid items-start gap-4 sm:gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] xl:grid-rows-[auto_1fr]">
            <div className="min-w-0">
              <ImageGallery
                images={allImages}
                title={accommodation.name}
                featuredBadge={accommodation.is_featured}
                typeBadge={typeLabel}
              />
            </div>

            <aside className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
              <section className="rounded-[28px] border border-white/70 bg-white/92 p-4 shadow-[0_24px_70px_rgba(25,48,89,0.12)] backdrop-blur-sm sm:p-5 md:p-6">
                <div className="inline-flex rounded-full bg-[#193059] px-4 py-1.5 text-sm font-semibold text-white">
                  {typeLabel}
                </div>

                <h1
                  className="mt-3 break-words text-[1.75rem] font-bold leading-[1.1] text-[#193059] sm:mt-4 sm:text-[2.25rem] sm:leading-[0.95] md:text-[2.8rem]"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {accommodation.name}
                </h1>

                {(accommodation.address || accommodation.parish) && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    <LocationIcon />
                    <span>{[accommodation.address, accommodation.parish].filter(Boolean).join(", ")}</span>
                  </div>
                )}

                <p className="mt-3 line-clamp-3 text-sm leading-5 sm:mt-4 sm:leading-6 text-slate-600">
                  {stayHighlights[0] ||
                    "A polished Barbados stay designed for relaxed arrival, smooth hosting, and easy trip planning."}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 xl:grid-cols-4">
                  {accommodation.bedroom_count !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-2 py-2 sm:px-3.5 sm:py-3">
                      <div className="flex items-center gap-2 text-[#407FC2] [&>svg]:hidden sm:[&>svg]:block">
                        <HomeIcon />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                          Bedrooms
                        </span>
                      </div>
                      <p className="mt-1 text-lg font-bold text-[#193059] sm:mt-2 sm:text-xl">
                        {accommodation.bedroom_count}
                      </p>
                    </div>
                  )}
                  {accommodation.bathroom_count !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-2 py-2 sm:px-3.5 sm:py-3">
                      <div className="flex items-center gap-2 text-[#407FC2] [&>svg]:hidden sm:[&>svg]:block">
                        <BathIcon />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                          Baths
                        </span>
                      </div>
                      <p className="mt-1 text-lg font-bold text-[#193059] sm:mt-2 sm:text-xl">
                        {accommodation.bathroom_count}
                      </p>
                    </div>
                  )}
                  {accommodation.bed_count !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-2 py-2 sm:px-3.5 sm:py-3">
                      <div className="flex items-center gap-2 text-[#407FC2] [&>svg]:hidden sm:[&>svg]:block">
                        <BedIcon />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                          Beds
                        </span>
                      </div>
                      <p className="mt-1 text-lg font-bold text-[#193059] sm:mt-2 sm:text-xl">
                        {accommodation.bed_count}
                      </p>
                    </div>
                  )}
                  {accommodation.max_guest_capacity !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-2 py-2 sm:px-3.5 sm:py-3">
                      <div className="flex items-center gap-2 text-[#407FC2] [&>svg]:hidden sm:[&>svg]:block">
                        <UsersIcon />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                          Guests
                        </span>
                      </div>
                      <p className="mt-1 text-lg font-bold text-[#193059] sm:mt-2 sm:text-xl">
                        {accommodation.max_guest_capacity}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-2.5">
                  <div className="hidden rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3 py-2.5 sm:block sm:px-4 sm:py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                      Stay Snapshot
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-5 sm:mt-1.5 sm:leading-6 text-[#193059]">
                      {stayHighlights[0] ||
                        "Reach out to the host for exact stay details, arrival preferences, and property questions."}
                    </p>
                  </div>

                  {accommodation.amenities && accommodation.amenities.length > 0 && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3 py-2.5 sm:px-4 sm:py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                        Amenities
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {accommodation.amenities.map((amenity) => (
                          <span
                            key={amenity}
                            className="inline-flex rounded-full border border-[#dbe7f2] bg-white px-2.5 py-1 text-xs font-medium text-[#193059]"
                          >
                            {getAmenityLabel(amenity)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3 py-2.5 sm:px-4 sm:py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                      Policies
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-semibold text-[#193059] sm:flex sm:flex-wrap sm:gap-2 sm:text-xs">
                      {policies.map((policy) => (
                        <span
                          key={policy.key}
                          className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 [&>svg]:shrink-0 sm:rounded-full sm:px-2.5 ${
                            policy.value
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {policy.value ? <CheckIcon /> : <XIcon />}
                          <span className="min-w-0 break-words">{policy.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {(accommodation.transportation_notes || accommodation.pickup_notes) && (
                    <div className="grid grid-cols-2 gap-2">
                      {accommodation.transportation_notes && (
                        <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3 py-2.5 sm:px-4 sm:py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                            Transportation
                          </p>
                          <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-[#193059]">
                            {accommodation.transportation_notes}
                          </p>
                        </div>
                      )}

                      {accommodation.pickup_notes && (
                        <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3 py-2.5 sm:px-4 sm:py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                            Pickup Notes
                          </p>
                          <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-[#193059]">
                            {accommodation.pickup_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {accommodation.vendors && (
                  <div className="mt-3 rounded-[22px] sm:mt-4 border border-[#dbe7f2] bg-[#f7fbff] px-3 py-2.5 sm:px-4 sm:py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                      Hosted By
                    </p>
                    <div className="mt-2 flex items-center gap-2 sm:mt-2.5 sm:gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10 bg-gradient-to-br from-[#407FC2] to-[#193059] text-sm font-bold text-white">
                        {accommodation.vendors.name?.charAt(0) || "V"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#193059]">
                          {accommodation.vendors.name || "Vendor"}
                        </p>
                        {accommodation.vendors.contact_email && (
                          <p className="break-words text-xs text-slate-500 sm:text-sm">{accommodation.vendors.contact_email}</p>
                        )}
                        {accommodation.vendors.business_phone && (
                          <p className="break-words text-xs text-slate-500 sm:text-sm">{accommodation.vendors.business_phone}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-3 rounded-[24px] bg-[#193059] p-3 text-white shadow-[0_22px_50px_rgba(25,48,89,0.22)] sm:mt-4 sm:p-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 rounded-2xl border border-white/12 bg-white/8 px-3 py-2 sm:col-span-1 sm:px-4 sm:py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
                        Check-in / Check-out
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {accommodation.check_in_time || "Flexible arrival"} / {accommodation.check_out_time || "Flexible departure"}
                      </p>
                    </div>

                    <div className="hidden rounded-2xl border border-white/12 bg-white/8 px-4 py-3 sm:block">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
                        Best Fit
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {positivePolicies.length > 0
                          ? positivePolicies.map((policy) => policy.label).join(", ")
                          : "Reach out to the host for stay details and special requests."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
                    {accommodation.vendors?.contact_email ? (
                      <a
                        href={`mailto:${accommodation.vendors.contact_email}`}
                        className="inline-flex items-center justify-center rounded-full border border-white/30 min-h-11 px-2 py-2 text-xs font-semibold text-white sm:px-5 sm:py-3 sm:text-sm transition-colors hover:bg-white/10"
                      >
                        Email host
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center rounded-full bg-slate-300 min-h-11 px-2 py-2 text-xs font-semibold text-white sm:px-5 sm:py-3 sm:text-sm"
                      >
                        Email unavailable
                      </button>
                    )}

                    {accommodation.vendors?.business_phone ? (
                      <a
                        href={formatPhoneHref(accommodation.vendors.business_phone)}
                        className="inline-flex items-center justify-center rounded-full border border-white/30 min-h-11 px-2 py-2 text-xs font-semibold text-white sm:px-5 sm:py-3 sm:text-sm transition-colors hover:bg-white/10"
                      >
                        Call host
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center rounded-full border border-white/20 min-h-11 px-2 py-2 text-xs font-semibold text-white sm:px-5 sm:py-3 sm:text-sm/60"
                      >
                        Call unavailable
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </aside>

            <section
              id="accommodation-booking"
              aria-label="Accommodation booking"
              className="min-w-0 scroll-mt-28 rounded-[28px] bg-[#193059] p-4 text-white shadow-[0_22px_50px_rgba(25,48,89,0.22)] sm:p-5 md:p-6 xl:col-start-1 xl:row-start-2"
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
                    Nightly Rate
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none sm:mt-1.5 sm:text-[2rem]">{formatAccommodationNightlyPrice(accommodation)}</p>
                  <p className="mt-1 text-xs text-white/70">
                    {accommodation.price_min_usd !== null ? "USD for available nights · choose dates for your total" : "The host has no open nights available to request right now"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/80">
                  Host approval required
                </div>
              </div>

              <AccommodationBookingForm
                accommodationId={accommodation.id}
                maxGuests={accommodation.max_guest_capacity}
                initialSelection={initialSelection}
              />
            </section>
          </div>
        </div>
      </section>

      {hasValidCoordinates(accommodation.latitude, accommodation.longitude) && (
        <section className="bg-[#f4f8fc] pb-8 sm:pb-16">
          <div className="container mx-auto max-w-7xl px-4">
            <ListingMap
              title="Stay Map"
              description="This accommodation has a saved map pin so guests can preview where the stay is located before booking."
              markers={[
                {
                  id: accommodation.id,
                  kind: "accommodation",
                  title: accommodation.name,
                  href: `/accommodations/${accommodation.id}`,
                  latitude: accommodation.latitude as number,
                  longitude: accommodation.longitude as number,
                  imageUrl: accommodation.image_url,
                  locationLabel:
                    [accommodation.address, accommodation.parish].filter(Boolean).join(", ") ||
                    null,
                  detailLine: `${typeLabel} | ${formatAccommodationNightlyPrice(accommodation)}`,
                  badge: typeLabel,
                },
              ]}
              emptyMessage="This accommodation does not have a saved map location yet."
            />
          </div>
        </section>
      )}
    </>
  );
}
