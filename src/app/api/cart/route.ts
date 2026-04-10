import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCartLinesWithPreview } from "@/lib/cart/service";
import { handleCartRouteError } from "@/api-shared/cart-route-errors";
import { requireRole } from "@/api-shared/route-helpers";

export async function GET() {
  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["user", "vendor", "admin"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  try {
    const lines = await listCartLinesWithPreview(supabase);
    return NextResponse.json(lines);
  } catch (error: unknown) {
    return handleCartRouteError(error);
  }
}
