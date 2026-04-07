import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listManageSlotsForActivity } from "@/lib/slots/service";
import { mapSlotRouteError } from "@/lib/slots/route-utils";
import { parseUuidParam, requireRole } from "@/api-shared/route-helpers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const resolvedParams = await context.params;
  const parsedParam = parseUuidParam(resolvedParams?.id, "activity");
  if ("response" in parsedParam) {
    return parsedParam.response;
  }
  const { id } = parsedParam;

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["admin", "vendor"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }
  const { role } = roleResult;

  try {
    const slots = await listManageSlotsForActivity(supabase, id, {
      isAdmin: role === "admin",
    });
    return NextResponse.json(slots);
  } catch (error: unknown) {
    return mapSlotRouteError(error);
  }
}
