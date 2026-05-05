import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateAvailabilitySlot } from "@/lib/slots/service";
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
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  const resolvedParams = await context.params;
  const parsedSlot = parseUuidParam(resolvedParams?.id, "slot");
  if ("response" in parsedSlot) {
    return parsedSlot.response;
  }

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
    const { data: slot, error } = await supabase
      .from("availability_slots")
      .select("activity_id")
      .eq("id", parsedSlot.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not load availability slot: ${error.message}`);
    }
    if (!slot) {
      throw new Error("Slot not found");
    }

    const updatedSlot = await updateAvailabilitySlot(
      supabase,
      slot.activity_id,
      parsedSlot.id,
      parsed.input,
      { isAdmin: role === "admin" },
    );

    return NextResponse.json(updatedSlot);
  } catch (error: unknown) {
    return mapSlotRouteError(error);
  }
}
