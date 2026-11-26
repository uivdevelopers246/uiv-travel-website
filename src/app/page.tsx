import Image from "next/image";
import Link from "next/link";
import type { QueryData } from "@supabase/supabase-js";
import { Header } from "@/components/layout/header";
import { HomeShowcase } from "@/components/home/HomeShowcase";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import type { ActivityDisplay } from "@/lib/activities/types";
import { createPublicClient } from "@/lib/supabase/public";
import { withAccommodationBookablePrices } from "@/lib/accommodation-calendar/pricing";

export const dynamic = "force-dynamic";

const HOME_ACTIVITY_SELECT =
  "id, title, description, location, category, duration_hours, price_per_person, max_capacity, image_url, is_featured, vendors(name)" as const;
const HOME_ACCOMMODATION_SELECT =
  "id, name, accommodation_type, bedroom_count, bed_count, bathroom_count, max_guest_capacity, amenities, address, parish, image_url, is_featured, vendors(name)" as const;

type VendorPreview = { name: string | null } | null;

function normalizeVendor(
  vendor: VendorPreview | VendorPreview[] | undefined,
): VendorPreview {
  if (Array.isArray(vendor)) {
    return vendor[0] ?? null;
  }

  return vendor ?? null;
}

export default async function Home() {
  const supabase = createPublicClient();

  const activitiesQuery = supabase
    .from("activities")
    .select(HOME_ACTIVITY_SELECT)
    .eq("status", "published")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  const accommodationsQuery = supabase
    .from("accommodations")
    .select(HOME_ACCOMMODATION_SELECT)
    .eq("status", "published")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  const [activitiesResult, accommodationsResult] = await Promise.all([
    activitiesQuery,
    accommodationsQuery,
  ]);
  type HomeActivityRow = QueryData<typeof activitiesQuery>[number];

  const activityRows: HomeActivityRow[] = activitiesResult.data ?? [];
  const accommodationRows = await withAccommodationBookablePrices(supabase, accommodationsResult.data ?? []);
  const activities: ActivityDisplay[] = activityRows.map(activity => ({
    id: activity.id,
    title: activity.title,
    description: activity.description,
    location: activity.location,
    category: activity.category,
    duration_hours: activity.duration_hours,
    price_per_person: activity.price_per_person,
    max_capacity: activity.max_capacity,
    image_url: activity.image_url,
    is_featured: activity.is_featured,
    vendors: normalizeVendor(activity.vendors),
  }));
  const accommodations: AccommodationDisplay[] = accommodationRows.map(
    accommodation => ({
    id: accommodation.id,
    name: accommodation.name,
    accommodation_type: accommodation.accommodation_type,
    bedroom_count: accommodation.bedroom_count,
    bed_count: accommodation.bed_count,
    bathroom_count: accommodation.bathroom_count,
    max_guest_capacity: accommodation.max_guest_capacity,
    price_min_usd: accommodation.price_min_usd,
    price_max_usd: accommodation.price_max_usd,
    amenities: accommodation.amenities,
    address: accommodation.address,
    parish: accommodation.parish,
    image_url: accommodation.image_url,
    is_featured: accommodation.is_featured,
    vendors: normalizeVendor(accommodation.vendors),
    }),
  );

  return (
    <>
      <Header />

      <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden max-[1249px]:min-h-[68vh] max-[1249px]:items-start max-[1249px]:pt-28">
        <div className="absolute inset-0">
          <Image
            src="/images/hero/RockBeach.webp"
            alt="Rock beach"
            fill
            priority
            className="object-cover object-top"
          />
        </div>
        <div className="absolute inset-0 bg-[#10223e]/65" />

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center min-[1250px]:mt-19">
          <h1
            className="mb-5 text-5xl font-bold sm:text-6xl md:text-7xl lg:text-8xl"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            <span className="text-[#FBCA1A]">Your Kind</span>
            <br />
            <span className="font-bold text-white">
              of Trip
            </span>
          </h1>

          <div className="mx-auto inline-flex max-w-3xl flex-col items-center px-5 py-5 sm:px-7">
            <p
              className="mb-6 max-w-3xl text-lg font-semibold leading-relaxed text-white sm:text-xl md:text-2xl"
              style={{
                fontFamily: "var(--font-source-sans)",
              }}
            >
              Discover locally hosted stays and experiences to plan your
              Barbados escape.
            </p>

            <Link
              href="/vacation-planning"
              className="inline-block rounded-full bg-[#FBCA1A] px-8 py-4 text-lg font-semibold text-[#193059] transition-colors hover:bg-[#f5c000]"
              style={{
                fontFamily: "var(--font-playfair)",
              }}
            >
              Explore stays and activities
            </Link>
          </div>
        </div>
      </section>

      <HomeShowcase
        activities={activities}
        accommodations={accommodations}
      />
    </>
  );
}
