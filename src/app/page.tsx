import Image from "next/image";
import Link from "next/link";
import type { QueryData } from "@supabase/supabase-js";
import { Header } from "@/components/layout/header";
import { HomeShowcase } from "@/components/home/HomeShowcase";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import type { ActivityDisplay } from "@/lib/activities/types";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 300;

const HOME_ACTIVITY_SELECT =
  "id, title, description, location, category, duration_hours, price_per_person, max_capacity, image_url, is_featured, vendors(name)" as const;
const HOME_ACCOMMODATION_SELECT =
  "id, name, accommodation_type, bedroom_count, bed_count, bathroom_count, max_guest_capacity, price_min_usd, price_max_usd, amenities, address, parish, image_url, is_featured, vendors(name)" as const;

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
  type HomeAccommodationRow = QueryData<typeof accommodationsQuery>[number];

  const activityRows: HomeActivityRow[] = activitiesResult.data ?? [];
  const accommodationRows: HomeAccommodationRow[] =
    accommodationsResult.data ?? [];
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

      <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/images/hero/BeachSunset.jpg"
            alt="Beach Sunset"
            fill
            priority
            className="object-cover object-top brightness-110 contrast-110"
          />
        </div>
        <div className="absolute inset-0 bg-black/10" />

        <div className="relative z-10 mx-auto mt-19 max-w-4xl px-4 text-center">
          <h1
            className="mb-6 text-6xl font-bold md:text-7xl lg:text-8xl"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            <span className="text-[#FBCA1A]">Low Rates,</span>
            <br />
            <span className="font-bold text-white">High Tide</span>
          </h1>

          <p
            className="mx-auto mb-12 max-w-3xl text-xl leading-relaxed text-white/90 md:text-2xl"
            style={{ fontFamily: "var(--font-source-sans)" }}
          >
            Combining local insights and AI innovation, UnitedIV redefines how
            travelers plan and experience Barbados
          </p>

          <Link
            href="/locallens"
            className="inline-block rounded-full border-2 border-white/40 px-8 py-4 text-lg font-medium text-white transition-all hover:bg-white/10 hover:border-white/60 backdrop-blur-sm"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Try LocalLens.ai
          </Link>
        </div>
      </section>

      <HomeShowcase
        activities={activities}
        accommodations={accommodations}
      />
    </>
  );
}
