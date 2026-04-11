import { NextResponse } from "next/server";
import {
  createAccommodation,
  listAccommodations,
  type AccommodationStatus,
} from "@/lib/accommodations/service";
import { createClient } from "@/lib/supabase/server";
import { hasValidCoordinates } from "@/lib/utils/geo";
import { normalizeOptionalImageUrl } from "@/lib/utils/image";
import {
  badRequest,
  forbidden,
  parseJsonBody,
  requireAuthenticatedUser,
  unauthorized,
} from "@/api-shared/route-helpers";

const validStatuses = new Set<AccommodationStatus>([
  "draft",
  "published",
  "archived",
]);

function validateNonNegInt(
  value: unknown,
  field: string,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer or null`);
  }
  return value;
}

function validatePositiveInt(
  value: unknown,
  field: string,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer or null`);
  }
  return value;
}

function validatePrice(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number or null`);
  }
  return value;
}

function parseAmenities(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("amenities must be an array of strings");
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string") {
      throw new Error(`amenities[${i}] must be a string`);
    }
    out.push(item.trim());
  }
  return out;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const authResponse = await requireAuthenticatedUser(supabase);
  if (authResponse) {
    return authResponse;
  }

  const parsedBody = await parseJsonBody(req);
  if ("response" in parsedBody) {
    return parsedBody.response;
  }
  const { body } = parsedBody;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return badRequest("Name is required");
  }
  if (name.length > 255) {
    return badRequest("Name is too long (max 255 characters)");
  }

  const accommodationType =
    typeof body.accommodation_type === "string"
      ? body.accommodation_type.trim()
      : "";
  if (!accommodationType) {
    return badRequest("accommodation_type is required");
  }
  if (accommodationType.length > 120) {
    return badRequest("accommodation_type is too long (max 120 characters)");
  }

  if (body.status !== undefined && body.status !== null) {
    if (
      typeof body.status !== "string" ||
      !validStatuses.has(body.status as AccommodationStatus)
    ) {
      return badRequest("Invalid status");
    }
  }

  const hasLat = body.latitude !== undefined;
  const hasLng = body.longitude !== undefined;
  if (hasLat || hasLng) {
    if (!hasLat || !hasLng) {
      return badRequest("Provide both latitude and longitude, or omit both");
    }
    if (!hasValidCoordinates(body.latitude as number, body.longitude as number)) {
      return badRequest(
        "Latitude must be between -90 and 90, longitude between -180 and 180.",
      );
    }
  }

  try {
    const bedroom_count = validateNonNegInt(body.bedroom_count, "bedroom_count");
    const bed_count = validateNonNegInt(body.bed_count, "bed_count");
    const bathroom_count = validateNonNegInt(
      body.bathroom_count,
      "bathroom_count",
    );
    const max_guest_capacity = validatePositiveInt(
      body.max_guest_capacity,
      "max_guest_capacity",
    );
    const price_min_usd = validatePrice(body.price_min_usd, "price_min_usd");
    const price_max_usd = validatePrice(body.price_max_usd, "price_max_usd");

    if (
      price_min_usd != null &&
      price_max_usd != null &&
      price_min_usd > price_max_usd
    ) {
      return badRequest("price_min_usd must be less than or equal to price_max_usd");
    }

    const amenities = parseAmenities(body.amenities);

    const createPayload: Parameters<typeof createAccommodation>[1] = {
      name,
      accommodation_type: accommodationType,
    };

    if (bedroom_count !== undefined) createPayload.bedroom_count = bedroom_count;
    if (bed_count !== undefined) createPayload.bed_count = bed_count;
    if (bathroom_count !== undefined)
      createPayload.bathroom_count = bathroom_count;
    if (max_guest_capacity !== undefined)
      createPayload.max_guest_capacity = max_guest_capacity;
    if (price_min_usd !== undefined) createPayload.price_min_usd = price_min_usd;
    if (price_max_usd !== undefined) createPayload.price_max_usd = price_max_usd;

    if (typeof body.check_in_time === "string") {
      createPayload.check_in_time = body.check_in_time.trim() || null;
    } else if (body.check_in_time === null) {
      createPayload.check_in_time = null;
    }
    if (typeof body.check_out_time === "string") {
      createPayload.check_out_time = body.check_out_time.trim() || null;
    } else if (body.check_out_time === null) {
      createPayload.check_out_time = null;
    }

    if (typeof body.suitable_for_children === "boolean") {
      createPayload.suitable_for_children = body.suitable_for_children;
    }
    if (typeof body.wheelchair_accessible === "boolean") {
      createPayload.wheelchair_accessible = body.wheelchair_accessible;
    }
    if (typeof body.smoking_allowed === "boolean") {
      createPayload.smoking_allowed = body.smoking_allowed;
    }
    if (typeof body.pets_allowed === "boolean") {
      createPayload.pets_allowed = body.pets_allowed;
    }
    if (typeof body.beach_access_or_view === "boolean") {
      createPayload.beach_access_or_view = body.beach_access_or_view;
    }
    if (typeof body.transportation_provided === "boolean") {
      createPayload.transportation_provided = body.transportation_provided;
    }
    if (typeof body.amenities_complete === "boolean") {
      createPayload.amenities_complete = body.amenities_complete;
    }

    if (amenities !== undefined) createPayload.amenities = amenities;

    if (typeof body.address === "string") {
      createPayload.address = body.address.trim() || null;
    } else if (body.address === null) {
      createPayload.address = null;
    }
    if (typeof body.parish === "string") {
      createPayload.parish = body.parish.trim() || null;
    } else if (body.parish === null) {
      createPayload.parish = null;
    }
    if (typeof body.transportation_notes === "string") {
      createPayload.transportation_notes =
        body.transportation_notes.trim() || null;
    } else if (body.transportation_notes === null) {
      createPayload.transportation_notes = null;
    }
    if (typeof body.pickup_notes === "string") {
      createPayload.pickup_notes = body.pickup_notes.trim() || null;
    } else if (body.pickup_notes === null) {
      createPayload.pickup_notes = null;
    }
    if (body.image_url !== undefined) {
      createPayload.image_url = normalizeOptionalImageUrl(body.image_url) ?? null;
    }

    if (
      typeof body.status === "string" &&
      validStatuses.has(body.status as AccommodationStatus)
    ) {
      createPayload.status = body.status as AccommodationStatus;
    }

    if (
      body.latitude !== undefined &&
      body.longitude !== undefined &&
      hasValidCoordinates(body.latitude as number, body.longitude as number)
    ) {
      createPayload.latitude = body.latitude as number;
      createPayload.longitude = body.longitude as number;
    }

    const created = await createAccommodation(supabase, createPayload);
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create accommodation";
    if (message === "Unauthorized") {
      return unauthorized(message);
    }
    if (message === "User is not associated with a vendor") {
      return forbidden(message);
    }
    return badRequest(message);
  }
}

export async function GET(req: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit")
    ? Number(searchParams.get("limit"))
    : undefined;
  const offset = searchParams.get("offset")
    ? Number(searchParams.get("offset"))
    : undefined;

  if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    return badRequest("limit must be between 1 and 100");
  }
  if (offset !== undefined && (Number.isNaN(offset) || offset < 0)) {
    return badRequest("offset must be a non-negative number");
  }

  try {
    const accommodations = await listAccommodations(supabase, {
      limit,
      offset,
    });
    return NextResponse.json(accommodations, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list accommodations";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
