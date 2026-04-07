import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteActivity,
  getActivityById,
  updateActivity,
  type ActivityCategory,
  type UpdateActivityInput,
} from "@/lib/activities/service";
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
} from "@/api-shared/route-helpers";

const validCategories = new Set<ActivityCategory>([
  "water-sports",
  "wildlife",
  "adventure",
  "culture",
  "nature",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const parsedParam = parseUuidParam(resolvedParams?.id, "activity");
  if ("response" in parsedParam) {
    return parsedParam.response;
  }
  const { id } = parsedParam;

  const supabase = await createClient();
  try {
    const activity = await getActivityById(supabase, id);
    if (activity === null) {
      return notFound("Activity not found");
    }
    return NextResponse.json(activity);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch activity";
    return serverError(message);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
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
  const { body } = parsedBody;

  const updates: UpdateActivityInput = {};

  if (typeof body?.title === "string") {
    const trimmed = body.title.trim();
    if (!trimmed) {
      return badRequest("Title cannot be empty");
    }
    if (trimmed.length > 255) {
      return badRequest("Title is too long (max 255 characters)");
    }
    updates.title = trimmed;
  }
  if (typeof body?.description !== "undefined") {
    updates.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (typeof body?.location !== "undefined") {
    updates.location = typeof body.location === "string" ? body.location.trim() || null : null;
  }
  if (typeof body?.category === "string") {
    const trimmed = body.category.trim();
    if (!trimmed) {
      return badRequest("Category cannot be empty");
    }
    if (!validCategories.has(trimmed as ActivityCategory)) {
      return badRequest("Invalid category");
    }
    updates.category = trimmed as ActivityCategory;
  }
  if (typeof body?.duration_hours !== "undefined") {
    if (body.duration_hours === null) {
      updates.duration_hours = null;
    } else if (
      typeof body.duration_hours === "number" &&
      !Number.isNaN(body.duration_hours) &&
      body.duration_hours >= 0 &&
      body.duration_hours <= 24
    ) {
      updates.duration_hours = body.duration_hours;
    } else {
      return badRequest("duration_hours must be between 0 and 24, or null");
    }
  }
  if (typeof body?.price_per_person !== "undefined") {
    if (body.price_per_person === null) {
      updates.price_per_person = null;
    } else if (typeof body.price_per_person === "number" && !Number.isNaN(body.price_per_person) && body.price_per_person >= 0) {
      updates.price_per_person = body.price_per_person;
    } else {
      return badRequest("price_per_person must be a non-negative number or null");
    }
  }
  if (typeof body?.max_capacity !== "undefined") {
    if (body.max_capacity === null) {
      updates.max_capacity = null;
    } else if (
      typeof body.max_capacity === "number" &&
      Number.isInteger(body.max_capacity) &&
      body.max_capacity >= 1 &&
      body.max_capacity <= 1000
    ) {
      updates.max_capacity = body.max_capacity;
    } else {
      return badRequest("max_capacity must be between 1 and 1000, or null");
    }
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

  const latPresent = body?.latitude !== undefined;
  const lngPresent = body?.longitude !== undefined;
  const coordPairError =
    "Provide both latitude and longitude as numbers in range (-90–90, -180–180), or both null to clear.";

  if (latPresent && lngPresent) {
    const lat = body.latitude as number | null;
    const lng = body.longitude as number | null;
    if (lat === null && lng === null) {
      updates.latitude = null;
      updates.longitude = null;
    } else if (hasValidCoordinates(lat, lng)) {
      updates.latitude = lat;
      updates.longitude = lng;
    } else {
      return badRequest(coordPairError);
    }
  } else if (latPresent || lngPresent) {
    return badRequest(coordPairError);
  }

  if (Object.keys(updates).length === 0) {
    return badRequest("No updates provided");
  }

  updates.status = "published";

  try {
    const isAdmin = role === "admin";
    const data = await updateActivity(supabase, id, updates, { isAdmin });
    return NextResponse.json({ id: data.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update activity";
    if (message === "Unauthorized" || message === "User is not associated with a vendor") {
      return message === "Unauthorized" ? unauthorized(message) : forbidden(message);
    }
    if (message.includes("PGRST116")) {
      return notFound("Activity not found or access denied");
    }
    return badRequest(message);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
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
    const deleted = await deleteActivity(supabase, id, { isAdmin: role === "admin" });
    return NextResponse.json(deleted, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete activity";
    if (message === "Unauthorized" || message === "User is not associated with a vendor") {
      return message === "Unauthorized" ? unauthorized(message) : forbidden(message);
    }
    if (message === "Row not found" || message.includes("PGRST116")) {
      return notFound("Activity not found");
    }
    return badRequest(message);
  }
}
