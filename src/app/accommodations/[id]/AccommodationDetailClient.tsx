"use client";

import { accommodationTypes, amenityOptions } from "@/lib/accommodations/constants";
import {
  Breadcrumb,
  ImageGallery,
  VendorInfo,
  InfoCard,
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

export function AccommodationDetailClient({ accommodation, images }: Props) {
  const typeLabel =
    accommodationTypes.find((t) => t.value === accommodation.accommodation_type)?.label ||
    accommodation.accommodation_type;

  // Build gallery: main image + additional images
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

  // Format price display
  const formatPrice = () => {
    if (accommodation.price_min_usd === null) return "Price on request";
    if (accommodation.price_max_usd && accommodation.price_max_usd !== accommodation.price_min_usd) {
      return `$${accommodation.price_min_usd} - $${accommodation.price_max_usd}`;
    }
    return `$${accommodation.price_min_usd}`;
  };

  // Get amenity labels
  const getAmenityLabel = (value: string) => {
    return amenityOptions.find((a) => a.value === value)?.label || value;
  };

  // Policy items for cleaner rendering
  const policies = [
    { key: "children", label: "Children Welcome", value: accommodation.suitable_for_children },
    { key: "pets", label: "Pets Allowed", value: accommodation.pets_allowed },
    { key: "smoking", label: "Smoking Allowed", value: accommodation.smoking_allowed },
    { key: "wheelchair", label: "Wheelchair Accessible", value: accommodation.wheelchair_accessible },
    { key: "beach", label: "Beach Access/View", value: accommodation.beach_access_or_view },
    { key: "transport", label: "Transportation", value: accommodation.transportation_provided },
  ];

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />

      <section className="py-8 bg-white">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Image Gallery */}
            <ImageGallery
              images={allImages}
              title={accommodation.name}
              featuredBadge={accommodation.is_featured}
              typeBadge={typeLabel}
            />

            {/* Accommodation Details */}
            <div className="space-y-6">
              {/* Title & Location */}
              <div>
                <h1
                  className="text-3xl md:text-4xl font-bold text-[#193059] mb-2"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {accommodation.name}
                </h1>
                {(accommodation.address || accommodation.parish) && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <LocationIcon />
                    <span>{[accommodation.address, accommodation.parish].filter(Boolean).join(", ")}</span>
                  </div>
                )}
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-[#193059]">{formatPrice()}</span>
                {accommodation.price_min_usd !== null && <span className="text-gray-500">/night</span>}
              </div>

              {/* Quick Info Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {accommodation.bedroom_count !== null && (
                  <InfoCard
                    icon={<HomeIcon />}
                    value={accommodation.bedroom_count}
                    label={accommodation.bedroom_count === 1 ? "Bedroom" : "Bedrooms"}
                  />
                )}
                {accommodation.bathroom_count !== null && (
                  <InfoCard
                    icon={<BathIcon />}
                    value={accommodation.bathroom_count}
                    label={accommodation.bathroom_count === 1 ? "Bathroom" : "Bathrooms"}
                  />
                )}
                {accommodation.bed_count !== null && (
                  <InfoCard
                    icon={<BedIcon />}
                    value={accommodation.bed_count}
                    label={accommodation.bed_count === 1 ? "Bed" : "Beds"}
                  />
                )}
                {accommodation.max_guest_capacity !== null && (
                  <InfoCard
                    icon={<UsersIcon />}
                    value={accommodation.max_guest_capacity}
                    label="Guests"
                  />
                )}
              </div>

              {/* Check-in/Check-out */}
              {(accommodation.check_in_time || accommodation.check_out_time) && (
                <div className="flex gap-6">
                  {accommodation.check_in_time && (
                    <div>
                      <p className="text-sm text-gray-500">Check-in</p>
                      <p className="font-semibold text-[#193059]">{accommodation.check_in_time}</p>
                    </div>
                  )}
                  {accommodation.check_out_time && (
                    <div>
                      <p className="text-sm text-gray-500">Check-out</p>
                      <p className="font-semibold text-[#193059]">{accommodation.check_out_time}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Amenities */}
              {accommodation.amenities && accommodation.amenities.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold text-[#193059] mb-3">Amenities</h2>
                  <div className="flex flex-wrap gap-2">
                    {accommodation.amenities.map((amenity) => (
                      <span
                        key={amenity}
                        className="inline-block bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full"
                      >
                        {getAmenityLabel(amenity)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Property Policies */}
              <div>
                <h2 className="text-xl font-semibold text-[#193059] mb-3">Property Policies</h2>
                <div className="grid grid-cols-2 gap-3">
                  {policies.map((policy) => (
                    <div key={policy.key} className="flex items-center gap-2">
                      {policy.value ? <CheckIcon /> : <XIcon />}
                      <span className="text-gray-700">{policy.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transportation & Pickup Notes */}
              {(accommodation.transportation_notes || accommodation.pickup_notes) && (
                <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                  {accommodation.transportation_notes && (
                    <div>
                      <h3 className="font-semibold text-[#193059] mb-1">Transportation Notes</h3>
                      <p className="text-gray-600">{accommodation.transportation_notes}</p>
                    </div>
                  )}
                  {accommodation.pickup_notes && (
                    <div>
                      <h3 className="font-semibold text-[#193059] mb-1">Pickup Information</h3>
                      <p className="text-gray-600">{accommodation.pickup_notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Vendor Info */}
              {accommodation.vendors && <VendorInfo vendor={accommodation.vendors} />}

              {/* CTA Button */}
              <button className="w-full py-4 bg-[#193059] hover:bg-[#407FC2] text-white text-lg font-semibold rounded-xl transition-colors">
                Book This Accommodation
              </button>
            </div>
          </div>
        </div>
      </section>

      {hasValidCoordinates(accommodation.latitude, accommodation.longitude) && (
        <section className="bg-white pb-12">
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
