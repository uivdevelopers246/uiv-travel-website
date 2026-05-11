import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { approveActivityBookingAsVendor } from "@/lib/orders/vendor-approval";
import {
  forbidden,
  parseUuidParam,
  requireSameOriginPost,
  requireRole,
  serverError,
  unauthorized,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

function mapError(error: unknown): NextResponse | null {
  const message = error instanceof Error ? error.message : "";
  if (message === "Unauthorized") {
    return unauthorized();
  }
  if (
    message.includes("User is not associated with a vendor") ||
    message === "Forbidden"
  ) {
    return forbidden();
  }
  if (message === "Booking not found") {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (message.startsWith("Forbidden:")) {
    return forbidden(message);
  }
  if (
    message.startsWith("Order is not awaiting vendor action") ||
    message === "Booking is not pending approval" ||
    message === "Booking has no order" ||
    message === "Could not confirm booking"
  ) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = requireSameOriginPost(req);
  if (originError) {
    return originError;
  }

  const resolved = await params;
  const parsed = parseUuidParam(resolved?.id, "booking");
  if ("response" in parsed) {
    return parsed.response;
  }

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["vendor"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  try {
    const result = await approveActivityBookingAsVendor(supabase, parsed.id);
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error: unknown) {
    const mapped = mapError(error);
    if (mapped) {
      return mapped;
    }
    return serverError(
      error instanceof Error ? error.message : "Something went wrong.",
    );
  }
}
