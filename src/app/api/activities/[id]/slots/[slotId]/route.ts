import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  cancelAvailabilitySlot,
  updateAvailabilitySlot,
} from "@/lib/slots/service";
import {
  mapSlotRouteError,
  parseUpdateSlotBody,
} from "@/lib/slots/route-utils";
import {
  parseJsonBody,
  parseUuidParam,
  requireRole,
} from "@/api-shared/route-helpers";

type RouteContext = {
  params: Promise<{ id: string; slotId: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  const resolvedParams = await context.params;
  const parsedActivity = parseUuidParam(resolvedParams?.id, "activity");
  if ("response" in parsedActivity) {
    return parsedActivity.response;
  }
  const parsedSlot = parseUuidParam(resolvedParams?.slotId, "slot");
  if ("response" in parsedSlot) {
    return parsedSlot.response;
  }
  const activityId = parsedActivity.id;
  const slotId = parsedSlot.id;

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

  const parsed = parseUpdateSlotBody(parsedBody.body);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const slot = await updateAvailabilitySlot(
      supabase,
      activityId,
      slotId,
      parsed.input,
      { isAdmin: role === "admin" },
    );
    return NextResponse.json(slot);
  } catch (error: unknown) {
    return mapSlotRouteError(error);
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const resolvedParams = await context.params;
  const parsedActivity = parseUuidParam(resolvedParams?.id, "activity");
  if ("response" in parsedActivity) {
    return parsedActivity.response;
  }
  const parsedSlot = parseUuidParam(resolvedParams?.slotId, "slot");
  if ("response" in parsedSlot) {
    return parsedSlot.response;
  }
  const activityId = parsedActivity.id;
  const slotId = parsedSlot.id;

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["admin", "vendor"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }
  const { role } = roleResult;

  try {
    const slot = await cancelAvailabilitySlot(supabase, activityId, slotId, {
      isAdmin: role === "admin",
    });
    return NextResponse.json(slot);
  } catch (error: unknown) {
    return mapSlotRouteError(error);
  }
}
