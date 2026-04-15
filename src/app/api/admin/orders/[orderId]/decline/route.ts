import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { declineActivityOrderAsAdmin } from "@/lib/orders/vendor-approval";
import {
  parseUuidParam,
  requireRole,
  serverError,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

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
  const roleResult = await requireRole(supabase, ["admin"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  try {
    await declineActivityOrderAsAdmin(parsed.id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("No pending approval bookings")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return serverError(
      error instanceof Error ? error.message : "Something went wrong.",
    );
  }
}
