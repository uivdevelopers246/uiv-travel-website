"use client";

import { activityCategories } from "@/lib/activities/constants";
import {
  Breadcrumb,
  ImageGallery,
  VendorInfo,
  InfoCard,
  ClockIcon,
  UsersIcon,
  CurrencyIcon,
  LocationIcon,
  StarIcon,
  type GalleryImage,
} from "@/components/shared";

type Activity = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
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

export function ActivityDetailClient({ activity, images }: Props) {
  const categoryLabel = activityCategories.find((c) => c.value === activity.category)?.label || activity.category;

  // Build gallery: main image + additional images
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

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />

      <section className="py-8 bg-white">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Image Gallery */}
            <ImageGallery
              images={allImages}
              title={activity.title}
              featuredBadge={activity.is_featured}
            />

            {/* Activity Details */}
            <div className="space-y-6">
              {/* Category Badge & Rating */}
              <div className="flex items-center gap-3">
                <span className="inline-block bg-[#407FC2]/10 text-[#407FC2] text-sm font-medium px-4 py-1 rounded-full">
                  {categoryLabel}
                </span>
                {activity.rating !== null && (
                  <div className="flex items-center gap-1 text-[#FBCA1A]">
                    <StarIcon />
                    <span className="text-gray-700 font-medium">{activity.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Title */}
              <h1
                className="text-3xl md:text-4xl font-bold text-[#193059]"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {activity.title}
              </h1>

              {/* Location */}
              {activity.location && (
                <div className="flex items-center gap-2 text-gray-600">
                  <LocationIcon />
                  <span>{activity.location}</span>
                </div>
              )}

              {/* Quick Info Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {activity.duration_hours !== null && (
                  <InfoCard
                    icon={<ClockIcon />}
                    value={`${activity.duration_hours} hrs`}
                    label="Duration"
                  />
                )}
                {activity.max_capacity !== null && (
                  <InfoCard
                    icon={<UsersIcon />}
                    value={activity.max_capacity}
                    label="Max Group"
                  />
                )}
                {activity.price_per_person !== null && (
                  <InfoCard
                    icon={<CurrencyIcon />}
                    value={`$${activity.price_per_person}`}
                    label="Per Person"
                  />
                )}
              </div>

              {/* Description */}
              <div>
                <h2 className="text-xl font-semibold text-[#193059] mb-3">About This Activity</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {activity.description || "No description available."}
                </p>
              </div>

              {/* Vendor Info */}
              {activity.vendors && <VendorInfo vendor={activity.vendors} />}

              {/* CTA Button */}
              <button className="w-full py-4 bg-[#193059] hover:bg-[#407FC2] text-white text-lg font-semibold rounded-xl transition-colors">
                Book This Activity
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
