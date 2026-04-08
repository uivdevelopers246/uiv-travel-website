import { Header } from "@/components/layout/header";
import type { AccommodationDisplay } from "@/lib/accommodations/types";
import type { ActivityDisplay } from "@/lib/activities/types";
import { createPublicClient } from "@/lib/supabase/public";
import { VacationPlanningClient } from "./VacationPlanningClient";

export const revalidate = 300;

const VACATION_ACTIVITY_SELECT =
  "id, title, description, location, latitude, longitude, category, duration_hours, price_per_person, max_capacity, image_url, is_featured, vendors(name)" as const;
const VACATION_ACCOMMODATION_SELECT =
  "id, name, accommodation_type, latitude, longitude, bedroom_count, bed_count, bathroom_count, max_guest_capacity, price_min_usd, price_max_usd, amenities, address, parish, image_url, is_featured, vendors(name)" as const;

type VendorPreview = { name: string | null } | null;
type VacationActivityRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string;
  duration_hours: number | null;
  price_per_person: number | null;
  max_capacity: number | null;
  image_url: string | null;
  is_featured: boolean;
  vendors?: VendorPreview | VendorPreview[];
};
type VacationAccommodationRow = {
  id: string;
  name: string;
  accommodation_type: string;
  latitude: number | null;
  longitude: number | null;
  bedroom_count: number | null;
  bed_count: number | null;
  bathroom_count: number | null;
  max_guest_capacity: number | null;
  price_min_usd: number | null;
  price_max_usd: number | null;
  amenities: string[];
  address: string | null;
  parish: string | null;
  image_url: string | null;
  is_featured: boolean;
  vendors?: VendorPreview | VendorPreview[];
};
type OrderedQueryResult<T> = Promise<{ data: T[] | null }>;
type VacationPlanningQueryClient = {
  from(table: "activities"): {
    select(query: typeof VACATION_ACTIVITY_SELECT): {
      eq(column: "status", value: "published"): {
        order(
          column: "created_at",
          options: { ascending: boolean },
        ): OrderedQueryResult<VacationActivityRow>;
      };
    };
  };
  from(table: "accommodations"): {
    select(query: typeof VACATION_ACCOMMODATION_SELECT): {
      eq(column: "status", value: "published"): {
        order(
          column: "created_at",
          options: { ascending: boolean },
        ): OrderedQueryResult<VacationAccommodationRow>;
      };
    };
  };
};

function normalizeVendor(
  vendor: VendorPreview | VendorPreview[] | undefined,
): VendorPreview {
  if (Array.isArray(vendor)) {
    return vendor[0] ?? null;
  }

  return vendor ?? null;
}

export default async function VacationPlanningPage() {
  const supabase = createPublicClient();
  const queryClient = supabase as unknown as VacationPlanningQueryClient;
  const activitiesQuery = queryClient
    .from("activities")
    .select(VACATION_ACTIVITY_SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  const accommodationsQuery = queryClient
    .from("accommodations")
    .select(VACATION_ACCOMMODATION_SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  const [activitiesResult, accommodationsResult] = await Promise.all([
    activitiesQuery,
    accommodationsQuery,
  ]);
  const activityRows: VacationActivityRow[] = activitiesResult.data ?? [];
  const accommodationRows: VacationAccommodationRow[] =
    accommodationsResult.data ?? [];
  const activities: ActivityDisplay[] = activityRows.map(activity => ({
    id: activity.id,
    title: activity.title,
    description: activity.description,
    location: activity.location,
    latitude: activity.latitude,
    longitude: activity.longitude,
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
    latitude: accommodation.latitude,
    longitude: accommodation.longitude,
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
      <VacationPlanningClient
        activities={activities}
        accommodations={accommodations}
      />
    </>
  );
}
