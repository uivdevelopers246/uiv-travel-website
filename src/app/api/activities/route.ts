import { NextResponse } from "next/server";
import {
  createActivity,
  listActivities,
  type ActivityCategory,
} from "@/lib/activities/service";
import { createClient } from "@/lib/supabase/server";
import { hasValidCoordinates } from "@/lib/utils/geo";
import { normalizeOptionalImageUrl } from "@/lib/utils/image";
import {
  badRequest,
  forbidden,
  parseJsonBody,
  requireAuthenticatedUser,
  unauthorized,
} from "../_shared/route-helpers";

const validCategories = new Set<ActivityCategory>([
    "water-sports", "wildlife", "adventure", "culture", "nature"
]);

function parseOptionalNumber(value: unknown): number | null | undefined {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value === "number" && !Number.isNaN(value)) {
        return value;
    }
    return Number.NaN;
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

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return badRequest("Title is required");
  }
  if (title.length > 255) {
    return badRequest("Title is too long (max 255 characters)");
  }

  const category = body.category as ActivityCategory;
  if (!category || !validCategories.has(category)) {
    return badRequest("Invalid category");
  }

  if (body.duration_hours !== undefined && body.duration_hours !== null) {
    if (
      typeof body.duration_hours !== "number" ||
      body.duration_hours < 0 ||
      body.duration_hours > 24
    ) {
      return badRequest("Duration must be between 0 and 24 hours");
    }
  }

  if (body.price_per_person !== undefined && body.price_per_person !== null) {
    if (typeof body.price_per_person !== "number" || body.price_per_person < 0) {
      return badRequest("Price must be a positive number");
    }
  }

  if (body.max_capacity !== undefined && body.max_capacity !== null) {
    if (
      typeof body.max_capacity !== "number" ||
      body.max_capacity < 1 ||
      body.max_capacity > 1000
    ) {
      return badRequest("Max capacity must be between 1 and 1000");
    }
  }

  const hasLat = body.latitude !== undefined;
  const hasLng = body.longitude !== undefined;
  const latitude = parseOptionalNumber(body.latitude);
  const longitude = parseOptionalNumber(body.longitude);
  if (hasLat || hasLng) {
    if (!hasLat || !hasLng) {
      return badRequest("Provide both latitude and longitude, or omit both");
    }
    if (!hasValidCoordinates(latitude, longitude)) {
      return badRequest(
        "Latitude must be between -90 and 90, longitude between -180 and 180.",
      );
    }
  }

  try {
    const createPayload = {
      title,
      description: body.description ?? null,
      location: body.location ?? null,
      category,
      duration_hours: body.duration_hours ?? null,
      price_per_person: body.price_per_person ?? null,
      max_capacity: body.max_capacity ?? null,
      image_url: normalizeOptionalImageUrl(body.image_url) ?? null,
      status: "published",
    } as Parameters<typeof createActivity>[1];

    if (
      body.latitude !== undefined &&
      body.longitude !== undefined &&
      hasValidCoordinates(latitude, longitude)
    ) {
      createPayload.latitude = latitude;
      createPayload.longitude = longitude;
    }

    const created = await createActivity(supabase, createPayload);
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create activity";
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
    const activities = await listActivities(supabase, { limit, offset });
    return NextResponse.json(activities, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list activities";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
