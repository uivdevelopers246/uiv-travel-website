import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getUserRole } from "@/lib/auth/roles";
import { getVendorByOwner } from "@/lib/vendors/service";
import {
  listVendorBookingActivityOptions,
  listVendorBookingPreviews,
} from "@/lib/activity-bookings/vendor-bookings";
import {
  parseLimitOffset,
  parseOptionalUuidParam,
} from "@/lib/activity-bookings/route-utils";
import type { ActivityBookingStatus } from "@/lib/activity-bookings/constants";
import {
  listVendorAccommodationOptions,
  listVendorAccommodationBookingPreviews,
} from "@/lib/accommodation-bookings/vendor-bookings";
import { serverError } from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

async function listBookingPrefix<T>(
  count: number,
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
): Promise<T[]> {
  const bookings: T[] = [];
  // Bound each read below Supabase's row limit and keep preview lookup URLs small.
  // ponytail: merging prefixes rereads older pages; use a database UNION if histories make this costly.
  while (bookings.length < count) {
    const pageSize = Math.min(100, count - bookings.length);
    const page = await fetchPage(bookings.length, pageSize);
    bookings.push(...page);
    if (page.length < pageSize) break;
  }
  return bookings;
}

function parseVendorBookingStatus(
  raw: string | null,
):
  | { ok: true; status: ActivityBookingStatus | undefined }
  | { ok: false; error: string } {
  if (raw === null || raw === "") {
    return { ok: true, status: "pending_approval" };
  }

  if (raw === "all") {
    return { ok: true, status: undefined };
  }

  if (raw === "pending") {
    return { ok: true, status: "pending_approval" };
  }

  if (
    raw === "confirmed" ||
    raw === "declined" ||
    raw === "completed" ||
    raw === "cancelled" ||
    raw === "expired" ||
    raw === "pending_approval"
  ) {
    return { ok: true, status: raw };
  }

  return { ok: false, error: "Invalid status." };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(supabase);
  if (role !== "vendor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let vendor;
  try {
    vendor = await getVendorByOwner(supabase, user.id);
  } catch {
    return serverError("Something went wrong. Please try again.");
  }

  if (!vendor) {
    return NextResponse.json(
      { error: "User is not associated with a vendor" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const statusParsed = parseVendorBookingStatus(url.searchParams.get("status"));
  if (!statusParsed.ok) {
    return NextResponse.json({ error: statusParsed.error }, { status: 400 });
  }

  const activityIdParsed = parseOptionalUuidParam(
    "activity_id",
    url.searchParams.get("activityId"),
  );
  if (!activityIdParsed.ok) {
    return NextResponse.json({ error: activityIdParsed.error }, { status: 400 });
  }

  const accommodationIdParsed = parseOptionalUuidParam(
    "accommodation_id", url.searchParams.get("accommodationId"),
  );
  if (!accommodationIdParsed.ok) {
    return NextResponse.json({ error: accommodationIdParsed.error }, { status: 400 });
  }
  if (activityIdParsed.value && accommodationIdParsed.value) {
    return NextResponse.json({ error: "Choose one listing filter." }, { status: 400 });
  }

  const { limit, offset } = parseLimitOffset(url.searchParams);
  const service = createServiceRoleClient();

  try {
    const [activityBookings, accommodationBookings, activities, accommodations] = await Promise.all([
      accommodationIdParsed.value ? [] : listBookingPrefix(offset + limit + 1, (pageOffset, pageLimit) => listVendorBookingPreviews(service, {
        vendorId: vendor.id,
        activityId: activityIdParsed.value,
        status: statusParsed.status,
        limit: pageLimit,
        offset: pageOffset,
      })),
      activityIdParsed.value ? [] : listBookingPrefix(offset + limit + 1, (pageOffset, pageLimit) => listVendorAccommodationBookingPreviews(service, {
        vendorId: vendor.id,
        accommodationId: accommodationIdParsed.value,
        status: statusParsed.status,
        limit: pageLimit,
        offset: pageOffset,
      })),
      listVendorBookingActivityOptions(service, vendor.id),
      listVendorAccommodationOptions(service, vendor.id),
    ]);
    const bookings = [
      ...activityBookings.map((booking) => ({ ...booking, line_type: "activity" as const })),
      ...accommodationBookings.map((booking) => ({ ...booking, line_type: "accommodation" as const })),
    ].sort((left, right) => right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id));
    return NextResponse.json({
      bookings: bookings.slice(offset, offset + limit),
      hasMore: bookings.length > offset + limit,
      activities,
      accommodations,
    });
  } catch {
    return serverError("Something went wrong. Please try again.");
  }
}
