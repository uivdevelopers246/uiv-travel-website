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

export const dynamic = "force-dynamic";

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
  const role = await getUserRole(supabase);

  if (role !== "vendor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let vendor;
  try {
    vendor = await getVendorByOwner(supabase, user.id);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to resolve vendor",
      },
      { status: 500 },
    );
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

  const { limit, offset } = parseLimitOffset(url.searchParams);
  const service = createServiceRoleClient();

  try {
    const [bookings, activities] = await Promise.all([
      listVendorBookingPreviews(service, {
        vendorId: vendor.id,
        activityId: activityIdParsed.value,
        status: statusParsed.status,
        limit,
        offset,
      }),
      listVendorBookingActivityOptions(service, vendor.id),
    ]);

    return NextResponse.json({ bookings, activities });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load vendor bookings",
      },
      { status: 500 },
    );
  }
}
