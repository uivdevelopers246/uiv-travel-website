import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  addOrMergeActivityLine,
  listCartLinesWithPreview,
} from "@/lib/cart/service";
import { handleCartRouteError } from "@/api-shared/cart-route-errors";
import {
  badRequest,
  parseJsonBody,
  parseUuidParam,
  requireSameOriginPost,
  requireRole,
} from "@/api-shared/route-helpers";

function parsePositiveIntegerParticipants(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

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

export async function POST(req: Request) {
  const originError = requireSameOriginPost(req);
  if (originError) {
    return originError;
  }

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["user", "vendor", "admin"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  const parsedBody = await parseJsonBody(req);
  if ("response" in parsedBody) {
    return parsedBody.response;
  }
  const { body } = parsedBody;

  const slotIdRaw =
    typeof body.slot_id === "string" ? body.slot_id : body.slotId;
  if (typeof slotIdRaw !== "string") {
    return badRequest("slot_id must be a UUID");
  }
  const slotParsed = parseUuidParam(slotIdRaw, "slot");
  if ("response" in slotParsed) {
    return slotParsed.response;
  }

  const participants = parsePositiveIntegerParticipants(body.participants);
  if (participants === null) {
    return badRequest("participants must be a positive integer");
  }

  try {
    const line = await addOrMergeActivityLine(supabase, {
      slot_id: slotParsed.id,
      participants,
    });
    return NextResponse.json(line);
  } catch (error: unknown) {
    return handleCartRouteError(error);
  }
}
