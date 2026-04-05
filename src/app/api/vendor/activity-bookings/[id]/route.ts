import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { getActivityBookingById } from "@/lib/activity-bookings/service";
import { isUuid } from "@/lib/activity-bookings/route-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = resolvedParams?.id;
  if (typeof id !== "string" || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid activity booking id." }, { status: 400 });
  }

  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role !== "vendor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const booking = await getActivityBookingById(supabase, id);
    if (booking === null) {
      return NextResponse.json({ error: "Activity booking not found" }, { status: 404 });
    }
    return NextResponse.json(booking);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load activity booking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
