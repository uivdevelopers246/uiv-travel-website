import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createAvailabilitySlot,
  listPublicSlotsForActivity,
} from "@/lib/slots/service";
import {
  mapSlotRouteError,
  parseCreateSlotBody,
} from "@/lib/slots/route-utils";
import {
  parseJsonBody,
  parseUuidParam,
  requireRole,
} from "@/api-shared/route-helpers";

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
  try {
    const slots = await listPublicSlotsForActivity(supabase, id);
    return NextResponse.json(slots);
  } catch (error: unknown) {
    return mapSlotRouteError(error);
  }
}

export async function POST(req: Request, context: RouteContext) {
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

  const parsedBody = await parseJsonBody(req);
  if ("response" in parsedBody) {
    return parsedBody.response;
  }

  const parsed = parseCreateSlotBody(parsedBody.body);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const slot = await createAvailabilitySlot(supabase, id, parsed.input, {
      isAdmin: role === "admin",
    });
    return NextResponse.json(slot);
  } catch (error: unknown) {
    return mapSlotRouteError(error);
  }
}
