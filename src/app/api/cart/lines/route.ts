import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  addOrMergeActivityLine,
  addOrMergeAccommodationLine,
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

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function parseDateOnlyString(
  value: unknown,
  field: "check_in" | "check_out",
): string | NextResponse {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) {
    return badRequest(`${field} must be a YYYY-MM-DD date`);
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
    typeof body.slot_id === "string"
      ? body.slot_id
      : typeof body.slotId === "string"
        ? body.slotId
        : undefined;
  const accommodationIdRaw =
    typeof body.accommodation_id === "string"
      ? body.accommodation_id
      : typeof body.accommodationId === "string"
        ? body.accommodationId
        : undefined;

  if (slotIdRaw !== undefined && accommodationIdRaw !== undefined) {
    return badRequest("Provide either slot_id or accommodation_id, not both");
  }

  if (accommodationIdRaw !== undefined) {
    const accommodationParsed = parseUuidParam(
      accommodationIdRaw,
      "accommodation",
    );
    if ("response" in accommodationParsed) {
      return accommodationParsed.response;
    }

    const checkInRaw =
      typeof body.check_in === "string"
        ? body.check_in
        : typeof body.checkIn === "string"
          ? body.checkIn
          : undefined;
    const checkOutRaw =
      typeof body.check_out === "string"
        ? body.check_out
        : typeof body.checkOut === "string"
          ? body.checkOut
          : undefined;

    const checkIn = parseDateOnlyString(checkInRaw, "check_in");
    if (checkIn instanceof NextResponse) {
      return checkIn;
    }
    const checkOut = parseDateOnlyString(checkOutRaw, "check_out");
    if (checkOut instanceof NextResponse) {
      return checkOut;
    }

    const guests = parsePositiveInteger(body.guests);
    if (guests === null) {
      return badRequest("guests must be a positive integer");
    }

    try {
      const line = await addOrMergeAccommodationLine(supabase, {
        accommodation_id: accommodationParsed.id,
        check_in: checkIn,
        check_out: checkOut,
        guests,
      });
      return NextResponse.json(line);
    } catch (error: unknown) {
      return handleCartRouteError(error);
    }
  }

  if (typeof slotIdRaw !== "string") {
    return badRequest("slot_id must be a UUID");
  }
  const slotParsed = parseUuidParam(slotIdRaw, "slot");
  if ("response" in slotParsed) {
    return slotParsed.response;
  }

  const participants = parsePositiveInteger(body.participants);
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
