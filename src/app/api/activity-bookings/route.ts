import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { listActivityBookings } from "@/lib/activity-bookings/service";
import {
  parseLimitOffset,
  parseOptionalStatusParam,
} from "@/lib/activity-bookings/route-utils";

export async function GET(req: Request) {
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role === "guest") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusParsed = parseOptionalStatusParam(url.searchParams.get("status"));
  if (!statusParsed.ok) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { limit, offset } = parseLimitOffset(url.searchParams);

  try {
    const bookings = await listActivityBookings(supabase, {
      userId: user.id,
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
