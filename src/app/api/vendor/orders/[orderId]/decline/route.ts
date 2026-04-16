import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { declineActivityOrderAsVendor } from "@/lib/orders/vendor-approval";
import {
  forbidden,
  parseUuidParam,
  requireRole,
  serverError,
  unauthorized,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

function mapErrorToResponse(error: unknown): NextResponse | null {
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
  if (message.startsWith("No pending approval bookings")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const resolved = await params;
  const parsed = parseUuidParam(resolved?.orderId, "order");
  if ("response" in parsed) {
    return parsed.response;
  }

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["vendor"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  try {
    const { declinedCount } = await declineActivityOrderAsVendor(
      supabase,
      parsed.id,
    );
    return NextResponse.json({ declined_count: declinedCount });
  } catch (error: unknown) {
    const mapped = mapErrorToResponse(error);
    if (mapped) {
      return mapped;
    }
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    return serverError(message);
  }
}
