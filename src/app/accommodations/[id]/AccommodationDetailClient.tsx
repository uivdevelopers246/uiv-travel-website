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
};

function formatPhoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function AccommodationDetailClient({ accommodation, images }: Props) {
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

  const formatPrice = () => {
    if (accommodation.price_min_usd === null) return "Price on request";
    if (
      accommodation.price_max_usd &&
      accommodation.price_max_usd !== accommodation.price_min_usd
    ) {
      return `$${accommodation.price_min_usd} - $${accommodation.price_max_usd}`;
    }
    return `$${accommodation.price_min_usd}`;
  };

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

      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef5fb_0%,#f9fcff_34%,#f4f8fc_100%)] pb-16">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(64,127,194,0.2),transparent_34%),radial-gradient(circle_at_top_right,rgba(251,202,26,0.14),transparent_26%)]" />

        <div className="relative mx-auto max-w-7xl px-4 pt-8">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <div>
              <ImageGallery
                images={allImages}
                title={accommodation.name}
                featuredBadge={accommodation.is_featured}
                typeBadge={typeLabel}
              />
            </div>

            <aside>
              <section className="rounded-[28px] border border-white/70 bg-white/92 p-5 shadow-[0_24px_70px_rgba(25,48,89,0.12)] backdrop-blur-sm md:p-6">
                <div className="inline-flex rounded-full bg-[#193059] px-4 py-1.5 text-sm font-semibold text-white">
                  {typeLabel}
                </div>

                <h1
                  className="mt-4 text-[2.25rem] font-bold leading-[0.95] text-[#193059] md:text-[2.8rem]"
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

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                  {stayHighlights[0] ||
                    "A polished Barbados stay designed for relaxed arrival, smooth hosting, and easy trip planning."}
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {accommodation.bedroom_count !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[#407FC2]">
                        <HomeIcon />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Bedrooms
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-[#193059]">
                        {accommodation.bedroom_count}
                      </p>
                    </div>
                  )}
                  {accommodation.bathroom_count !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[#407FC2]">
                        <BathIcon />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Baths
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-[#193059]">
                        {accommodation.bathroom_count}
                      </p>
                    </div>
                  )}
                  {accommodation.bed_count !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[#407FC2]">
                        <BedIcon />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Beds
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-[#193059]">
                        {accommodation.bed_count}
                      </p>
                    </div>
                  )}
                  {accommodation.max_guest_capacity !== null && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[#407FC2]">
                        <UsersIcon />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Guests
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-[#193059]">
                        {accommodation.max_guest_capacity}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Stay Snapshot
                    </p>
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-[#193059]">
                      {stayHighlights[0] ||
                        "Reach out to the host for exact stay details, arrival preferences, and property questions."}
                    </p>
                  </div>

                  {accommodation.amenities && accommodation.amenities.length > 0 && (
                    <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Amenities
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {accommodation.amenities.slice(0, 6).map((amenity) => (
                          <span
                            key={amenity}
                            className="inline-flex rounded-full border border-[#dbe7f2] bg-white px-2.5 py-1 text-xs font-medium text-[#193059]"
                          >
                            {getAmenityLabel(amenity)}
                          </span>
                        ))}
                        {accommodation.amenities.length > 6 && (
                          <span className="inline-flex rounded-full border border-[#dbe7f2] bg-white px-2.5 py-1 text-xs font-medium text-[#193059]">
                            +{accommodation.amenities.length - 6} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Policies
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#193059]">
                      {policies.map((policy) => (
                        <span
                          key={policy.key}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                            policy.value
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {policy.value ? <CheckIcon /> : <XIcon />}
                          {policy.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {(accommodation.transportation_notes || accommodation.pickup_notes) && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {accommodation.transportation_notes && (
                        <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Transportation
                          </p>
                          <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-[#193059]">
                            {accommodation.transportation_notes}
                          </p>
                        </div>
                      )}

                      {accommodation.pickup_notes && (
                        <div className="rounded-2xl border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
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
                  <div className="mt-4 rounded-[22px] border border-[#dbe7f2] bg-[#f7fbff] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Hosted By
                    </p>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#407FC2] to-[#193059] text-sm font-bold text-white">
                        {accommodation.vendors.name?.charAt(0) || "V"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#193059]">
                          {accommodation.vendors.name || "Vendor"}
                        </p>
                        {accommodation.vendors.contact_email && (
                          <p className="text-sm text-slate-500">{accommodation.vendors.contact_email}</p>
                        )}
                        {accommodation.vendors.business_phone && (
                          <p className="text-sm text-slate-500">{accommodation.vendors.business_phone}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div
                  id="accommodation-booking"
                  className="mt-4 rounded-[24px] bg-[#193059] p-4 text-white shadow-[0_22px_50px_rgba(25,48,89,0.22)]"
                >
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
                        Nightly Rate
                      </p>
                      <p className="mt-1.5 text-[2rem] font-bold leading-none">{formatPrice()}</p>
                      <p className="mt-1 text-xs text-white/70">
                        {accommodation.price_min_usd !== null ? "Before taxes and extras" : "Request pricing from the host"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/80">
                      Direct host coordination
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
                        Check-in / Check-out
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {accommodation.check_in_time || "Flexible arrival"} / {accommodation.check_out_time || "Flexible departure"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
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

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {accommodation.vendors?.contact_email ? (
                      <a
                        href={`mailto:${accommodation.vendors.contact_email}`}
                        className="inline-flex items-center justify-center rounded-full bg-[#FBCA1A] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#f0bf10]"
                      >
                        Email host
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center rounded-full bg-slate-300 px-5 py-3 text-sm font-semibold text-white"
                      >
                        Email unavailable
                      </button>
                    )}

                    {accommodation.vendors?.business_phone ? (
                      <a
                        href={formatPhoneHref(accommodation.vendors.business_phone)}
                        className="inline-flex items-center justify-center rounded-full border border-white/30 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                      >
                        Call host
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white/60"
                      >
                        Call unavailable
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>

      {hasValidCoordinates(accommodation.latitude, accommodation.longitude) && (
        <section className="bg-[#f4f8fc] pb-16">
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
                  detailLine: `${typeLabel}${accommodation.price_min_usd != null ? ` | ${formatPrice()}/night` : ""}`,
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
