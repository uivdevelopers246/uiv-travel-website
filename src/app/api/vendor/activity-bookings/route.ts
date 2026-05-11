import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { getVendorByOwner } from "@/lib/vendors/service";
import { listActivityBookings } from "@/lib/activity-bookings/service";
import {
  parseLimitOffset,
  parseOptionalStatusParam,
  parseOptionalUuidParam,
} from "@/lib/activity-bookings/route-utils";
import { serverError } from "@/api-shared/route-helpers";

export async function GET(req: Request) {
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role !== "vendor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const statusParsed = parseOptionalStatusParam(url.searchParams.get("status"));
  if (!statusParsed.ok) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const activityIdParsed = parseOptionalUuidParam(
    "activity_id",
    url.searchParams.get("activityId"),
  );
  if (!activityIdParsed.ok) {
    return NextResponse.json({ error: activityIdParsed.error }, { status: 400 });
  }

  const orderIdParsed = parseOptionalUuidParam(
    "order_id",
    url.searchParams.get("orderId"),
  );
  if (!orderIdParsed.ok) {
    return NextResponse.json({ error: orderIdParsed.error }, { status: 400 });
  }

  const { limit, offset } = parseLimitOffset(url.searchParams);

  try {
    const bookings = await listActivityBookings(supabase, {
      vendorId: vendor.id,
      activityId: activityIdParsed.value,
      orderId: orderIdParsed.value,
      status: statusParsed.status,
      limit,
      offset,
    });
    return NextResponse.json(bookings);
  } catch {
    return serverError("Something went wrong. Please try again.");
  }
}
