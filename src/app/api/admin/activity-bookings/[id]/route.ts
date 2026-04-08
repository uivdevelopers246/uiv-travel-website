import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { setActivityBookingCompleted } from "@/lib/activity-bookings/service";
import { isUuid } from "@/lib/activity-bookings/route-utils";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = resolvedParams?.id;
  if (typeof id !== "string" || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid activity booking id." }, { status: 400 });
  }

  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body?.status !== "string" || body.status !== "completed") {
    return NextResponse.json(
      { error: "Body must be { \"status\": \"completed\" }." },
      { status: 400 },
    );
  }

  if (Object.keys(body).length !== 1) {
    return NextResponse.json(
      { error: "Body must only include status." },
      { status: 400 },
    );
  }

  try {
    const booking = await setActivityBookingCompleted(supabase, id, {
      isAdmin: true,
    });
    return NextResponse.json(booking);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update activity booking";
    if (message.startsWith("Forbidden:")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (
      message.includes("PGRST116") ||
      message.toLowerCase().includes("no rows") ||
      message.includes("multiple (or no) rows")
    ) {
      return NextResponse.json({ error: "Activity booking not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
