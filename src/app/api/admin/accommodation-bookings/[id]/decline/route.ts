import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { declineAccommodationBookingAsAdmin } from "@/lib/orders/vendor-approval";
import {
  parseUuidParam,
  requireRole,
  serverError,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await params;
  const parsed = parseUuidParam(resolved?.id, "booking");
  if ("response" in parsed) {
    return parsed.response;
  }

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["admin"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  try {
    await declineAccommodationBookingAsAdmin(parsed.id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Booking not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message === "Booking is not pending approval" ||
      message === "Booking has no order" ||
      message === "Could not decline booking"
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return serverError(
      error instanceof Error ? error.message : "Something went wrong.",
    );
  }
}
