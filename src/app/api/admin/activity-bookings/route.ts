import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { listActivityBookings } from "@/lib/activity-bookings/service";
import {
  parseLimitOffset,
  parseOptionalStatusParam,
  parseOptionalUuidParam,
} from "@/lib/activity-bookings/route-utils";

export async function GET(req: Request) {
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);

  const userIdParsed = parseOptionalUuidParam("user_id", url.searchParams.get("userId"));
  if (!userIdParsed.ok) {
    return NextResponse.json({ error: userIdParsed.error }, { status: 400 });
  }

  const vendorIdParsed = parseOptionalUuidParam(
    "vendor_id",
    url.searchParams.get("vendorId"),
  );
  if (!vendorIdParsed.ok) {
    return NextResponse.json({ error: vendorIdParsed.error }, { status: 400 });
  }

  const activityIdParsed = parseOptionalUuidParam(
    "activity_id",
    url.searchParams.get("activityId"),
  );
  if (!activityIdParsed.ok) {
    return NextResponse.json({ error: activityIdParsed.error }, { status: 400 });
  }

  const slotIdParsed = parseOptionalUuidParam("slot_id", url.searchParams.get("slotId"));
  if (!slotIdParsed.ok) {
    return NextResponse.json({ error: slotIdParsed.error }, { status: 400 });
  }

  const orderIdParsed = parseOptionalUuidParam(
    "order_id",
    url.searchParams.get("orderId"),
  );
  if (!orderIdParsed.ok) {
    return NextResponse.json({ error: orderIdParsed.error }, { status: 400 });
  }

  const statusParsed = parseOptionalStatusParam(url.searchParams.get("status"));
  if (!statusParsed.ok) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { limit, offset } = parseLimitOffset(url.searchParams);

  try {
    const bookings = await listActivityBookings(supabase, {
      userId: userIdParsed.value,
      vendorId: vendorIdParsed.value,
      activityId: activityIdParsed.value,
      slotId: slotIdParsed.value,
      orderId: orderIdParsed.value,
      status: statusParsed.status,
      limit,
      offset,
    });
    return NextResponse.json(bookings);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list activity bookings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
