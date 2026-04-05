import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { cancelActivityBooking } from "@/lib/activity-bookings/service";
import { isUuid } from "@/lib/activity-bookings/route-utils";

const CANCEL_BUSINESS_ERROR_SNIPPET = "Booking not found, not owned by caller, or not cancellable";

export async function POST(
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

  if (role === "guest") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await cancelActivityBooking(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel activity booking";
    if (message.includes(CANCEL_BUSINESS_ERROR_SNIPPET)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
