import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteAccommodation,
  getAccommodationById,
  updateAccommodation,
  type AccommodationStatus,
  type UpdateAccommodationInput,
} from "@/lib/accommodations/service";
import { hasValidCoordinates } from "@/lib/utils/geo";
import { normalizeOptionalImageUrl } from "@/lib/utils/image";
import {
  badRequest,
  forbidden,
  notFound,
  parseJsonBody,
  parseUuidParam,
  requireRole,
  serverError,
  unauthorized,
} from "../../_shared/route-helpers";

const validStatuses = new Set<AccommodationStatus>([
  "draft",
  "published",
  "archived",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const parsedParam = parseUuidParam(resolvedParams?.id, "accommodation");
  if ("response" in parsedParam) {
    return parsedParam.response;
  }
  const { id } = parsedParam;

  const supabase = await createClient();
  try {
    const accommodation = await getAccommodationById(supabase, id);
    if (accommodation === null) {
      return notFound("Accommodation not found");
    }
    return NextResponse.json(accommodation);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch accommodation";
    return serverError(message);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const parsedParam = parseUuidParam(resolvedParams?.id, "accommodation");
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
  const { body } = parsedBody;

  const updates: UpdateAccommodationInput = {};

  if (typeof body?.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return badRequest("Name cannot be empty");
    }
    if (trimmed.length > 255) {
      return badRequest("Name is too long (max 255 characters)");
    }
    updates.name = trimmed;
  }

  if (typeof body?.accommodation_type === "string") {
    const trimmed = body.accommodation_type.trim();
    if (!trimmed) {
      return badRequest("accommodation_type cannot be empty");
    }
    if (trimmed.length > 120) {
      return badRequest("accommodation_type is too long (max 120 characters)");
    }
    updates.accommodation_type = trimmed;
  }

  if (typeof body?.bedroom_count !== "undefined") {
    if (body.bedroom_count === null) updates.bedroom_count = null;
    else if (
      typeof body.bedroom_count === "number" &&
      Number.isInteger(body.bedroom_count) &&
      body.bedroom_count >= 0
    ) {
      updates.bedroom_count = body.bedroom_count;
    } else {
      return badRequest("bedroom_count must be a non-negative integer or null");
    }
  }

  if (typeof body?.bed_count !== "undefined") {
    if (body.bed_count === null) updates.bed_count = null;
    else if (
      typeof body.bed_count === "number" &&
      Number.isInteger(body.bed_count) &&
      body.bed_count >= 0
    ) {
      updates.bed_count = body.bed_count;
    } else {
      return badRequest("bed_count must be a non-negative integer or null");
    }
  }

  if (typeof body?.bathroom_count !== "undefined") {
    if (body.bathroom_count === null) updates.bathroom_count = null;
    else if (
      typeof body.bathroom_count === "number" &&
      Number.isInteger(body.bathroom_count) &&
      body.bathroom_count >= 0
    ) {
      updates.bathroom_count = body.bathroom_count;
    } else {
      return badRequest("bathroom_count must be a non-negative integer or null");
    }
  }

  if (typeof body?.max_guest_capacity !== "undefined") {
    if (body.max_guest_capacity === null) updates.max_guest_capacity = null;
    else if (
      typeof body.max_guest_capacity === "number" &&
      Number.isInteger(body.max_guest_capacity) &&
      body.max_guest_capacity >= 1
    ) {
      updates.max_guest_capacity = body.max_guest_capacity;
    } else {
      return badRequest("max_guest_capacity must be a positive integer or null");
    }
  }

  if (typeof body?.price_min_usd !== "undefined") {
    if (body.price_min_usd === null) updates.price_min_usd = null;
    else if (
      typeof body.price_min_usd === "number" &&
      !Number.isNaN(body.price_min_usd) &&
      body.price_min_usd >= 0
    ) {
      updates.price_min_usd = body.price_min_usd;
    } else {
      return badRequest("price_min_usd must be a non-negative number or null");
    }
  }

  if (typeof body?.price_max_usd !== "undefined") {
    if (body.price_max_usd === null) updates.price_max_usd = null;
    else if (
      typeof body.price_max_usd === "number" &&
      !Number.isNaN(body.price_max_usd) &&
      body.price_max_usd >= 0
    ) {
      updates.price_max_usd = body.price_max_usd;
    } else {
      return badRequest("price_max_usd must be a non-negative number or null");
    }
  }

  const effMin =
    updates.price_min_usd !== undefined
      ? updates.price_min_usd
      : (body.price_min_usd as number | null | undefined);
  const effMax =
    updates.price_max_usd !== undefined
      ? updates.price_max_usd
      : (body.price_max_usd as number | null | undefined);
  if (
    effMin != null &&
    effMax != null &&
    typeof effMin === "number" &&
    typeof effMax === "number" &&
    effMin > effMax
  ) {
    return badRequest("price_min_usd must be less than or equal to price_max_usd");
  }

  if (typeof body?.check_in_time !== "undefined") {
    updates.check_in_time =
      typeof body.check_in_time === "string"
        ? body.check_in_time.trim() || null
        : null;
  }
  if (typeof body?.check_out_time !== "undefined") {
    updates.check_out_time =
      typeof body.check_out_time === "string"
        ? body.check_out_time.trim() || null
        : null;
  }

  if (typeof body?.suitable_for_children === "boolean") {
    updates.suitable_for_children = body.suitable_for_children;
  }
  if (typeof body?.wheelchair_accessible === "boolean") {
    updates.wheelchair_accessible = body.wheelchair_accessible;
  }
  if (typeof body?.smoking_allowed === "boolean") {
    updates.smoking_allowed = body.smoking_allowed;
  }
  if (typeof body?.pets_allowed === "boolean") {
    updates.pets_allowed = body.pets_allowed;
  }
  if (typeof body?.beach_access_or_view === "boolean") {
    updates.beach_access_or_view = body.beach_access_or_view;
  }
  if (typeof body?.transportation_provided === "boolean") {
    updates.transportation_provided = body.transportation_provided;
  }
  if (typeof body?.amenities_complete === "boolean") {
    updates.amenities_complete = body.amenities_complete;
  }

  if (typeof body?.amenities !== "undefined") {
    if (!Array.isArray(body.amenities)) {
      return badRequest("amenities must be an array of strings");
    }
    for (let i = 0; i < body.amenities.length; i++) {
      if (typeof body.amenities[i] !== "string") {
        return badRequest(`amenities[${i}] must be a string`);
      }
    }
    updates.amenities = (body.amenities as string[]).map((s) => s.trim());
  }

  if (typeof body?.address !== "undefined") {
    updates.address =
      typeof body.address === "string" ? body.address.trim() || null : null;
  }
  if (typeof body?.parish !== "undefined") {
    updates.parish =
      typeof body.parish === "string" ? body.parish.trim() || null : null;
  }
  if (typeof body?.transportation_notes !== "undefined") {
    updates.transportation_notes =
      typeof body.transportation_notes === "string"
        ? body.transportation_notes.trim() || null
        : null;
  }
  if (typeof body?.pickup_notes !== "undefined") {
    updates.pickup_notes =
      typeof body.pickup_notes === "string"
        ? body.pickup_notes.trim() || null
        : null;
  }
  if (typeof body?.image_url !== "undefined") {
    try {
      updates.image_url = normalizeOptionalImageUrl(body.image_url) ?? null;
    } catch (error: unknown) {
      return badRequest(
        error instanceof Error ? error.message : "Invalid image_url",
      );
    }
  }

  if (typeof body?.status !== "undefined") {
    if (body.status === null) {
      return badRequest("Invalid status");
    }
    if (
      typeof body.status !== "string" ||
      !validStatuses.has(body.status as AccommodationStatus)
    ) {
      return badRequest("Invalid status");
    }
    updates.status = body.status as AccommodationStatus;
  }

  const latPresent = body?.latitude !== undefined;
  const lngPresent = body?.longitude !== undefined;
  const coordPairError =
    "Provide both latitude and longitude as numbers in range (-90–90, -180–180), or both null to clear.";

  if (latPresent && lngPresent) {
    if (body.latitude === null && body.longitude === null) {
      updates.latitude = null;
      updates.longitude = null;
    } else if (
      hasValidCoordinates(
        body.latitude as number,
        body.longitude as number,
      )
    ) {
      updates.latitude = body.latitude as number;
      updates.longitude = body.longitude as number;
    } else {
      return badRequest(coordPairError);
    }
  } else if (latPresent || lngPresent) {
    return badRequest(coordPairError);
  }

  if (Object.keys(updates).length === 0) {
    return badRequest("No updates provided");
  }

  try {
    const isAdmin = role === "admin";
    const data = await updateAccommodation(supabase, id, updates, { isAdmin });
    return NextResponse.json({ id: data.id });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update accommodation";
    if (message === "Unauthorized" || message === "User is not associated with a vendor") {
      return message === "Unauthorized" ? unauthorized(message) : forbidden(message);
    }
    if (message.includes("PGRST116")) {
      return notFound("Accommodation not found or access denied");
    }
    return badRequest(message);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const parsedParam = parseUuidParam(resolvedParams?.id, "accommodation");
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
    const deleted = await deleteAccommodation(supabase, id, {
      isAdmin: role === "admin",
    });
    return NextResponse.json(deleted, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete accommodation";
    if (message === "Unauthorized" || message === "User is not associated with a vendor") {
      return message === "Unauthorized" ? unauthorized(message) : forbidden(message);
    }
    if (message === "Row not found" || message.includes("PGRST116")) {
      return notFound("Accommodation not found");
    }
    return badRequest(message);
  }
}
