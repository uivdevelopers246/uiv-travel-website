import { createClient } from "@/lib/supabase/server";
import {
  getCurrentVendorIdForManage,
  isValidUuid,
  requireManageListingAccess,
} from "../../_shared/server";

type ManagedActivity = {
  id: string;
  vendor_id: string;
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
  status: string;
};

type ManagedActivityErrorState = {
  error: {
    title: string;
    message: string;
  };
};

type ManagedActivitySuccessState = {
  activity: ManagedActivity;
};

export async function getManagedActivityPageData(
  activityId: string,
  redirectTo: string,
): Promise<ManagedActivityErrorState | ManagedActivitySuccessState> {
  if (!isValidUuid(activityId)) {
    return {
      error: {
        title: "Invalid activity",
        message: "The activity link is invalid.",
      },
    };
  }

  const supabase = await createClient();
  const role = await requireManageListingAccess(supabase, redirectTo);

  if (!role) {
    return {
      error: {
        title: "Access denied",
        message: "You need admin or vendor access to manage activities.",
      },
    };
  }

  const vendorId =
    role === "vendor"
      ? await getCurrentVendorIdForManage(supabase, redirectTo)
      : null;

  if (role === "vendor" && !vendorId) {
    return {
      error: {
        title: "Vendor profile required",
        message: "You need a vendor profile to manage activities.",
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activityQuery = (supabase as any)
    .from("activities")
    .select(
      "id, vendor_id, title, description, location, latitude, longitude, category, duration_hours, price_per_person, max_capacity, image_url, status",
    )
    .eq("id", activityId);

  if (vendorId) {
    activityQuery = activityQuery.eq("vendor_id", vendorId);
  }

  const { data: activity } = await activityQuery.maybeSingle();

  if (!activity) {
    return {
      error: {
        title: "Activity not found",
        message: "We couldn't find that activity.",
      },
    };
  }

  return {
    activity: activity as ManagedActivity,
  };
}
