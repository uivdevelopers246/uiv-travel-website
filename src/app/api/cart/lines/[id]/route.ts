import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  removeCartLine,
  updateCartLineGuests,
  updateCartLineParticipants,
} from "@/lib/cart/service";
import { handleCartRouteError } from "@/api-shared/cart-route-errors";
import {
  badRequest,
  parseJsonBody,
  parseUuidParam,
  requireSameOriginPost,
  requireRole,
} from "@/api-shared/route-helpers";

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = requireSameOriginPost(req);
  if (originError) {
    return originError;
  }

  const resolvedParams = await params;
  const parsedParam = parseUuidParam(resolvedParams?.id, "cart line");
  if ("response" in parsedParam) {
    return parsedParam.response;
  }
  const { id } = parsedParam;

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

  const hasGuests = Object.prototype.hasOwnProperty.call(body, "guests");
  const hasParticipants = Object.prototype.hasOwnProperty.call(
    body,
    "participants",
  );

  if (hasGuests && hasParticipants) {
    return badRequest("Provide either guests or participants, not both");
  }

  if (hasGuests) {
    const guests = parsePositiveInteger(body.guests);
    if (guests === null) {
      return badRequest("guests must be a positive integer");
    }

    try {
      const line = await updateCartLineGuests(supabase, {
        cart_line_id: id,
        guests,
      });
      return NextResponse.json(line);
    } catch (error: unknown) {
      return handleCartRouteError(error);
    }
  }

  const participants = parsePositiveInteger(body.participants);
  if (participants === null) {
    return badRequest("participants must be a positive integer");
  }

  try {
    const line = await updateCartLineParticipants(supabase, {
      cart_line_id: id,
      participants,
    });
    return NextResponse.json(line);
  } catch (error: unknown) {
    return handleCartRouteError(error);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = requireSameOriginPost(req);
  if (originError) {
    return originError;
  }

  const resolvedParams = await params;
  const parsedParam = parseUuidParam(resolvedParams?.id, "cart line");
  if ("response" in parsedParam) {
    return parsedParam.response;
  }
  const { id } = parsedParam;

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["user", "vendor", "admin"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  try {
    await removeCartLine(supabase, id);
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    return handleCartRouteError(error);
  }
}
