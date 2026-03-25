import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { getActivityById, deleteActivity, updateActivity, hasValidCoordinates } from "@/lib/activities/service";


export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = resolvedParams?.id;
  const isUuid = typeof id === "string" && /^[0-9a-fA-F-]{36}$/.test(id);
  if (!isUuid) {
    return NextResponse.json({ error: "Invalid activity id." }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const activity = await getActivityById(supabase, id);
    if (activity === null) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    return NextResponse.json(activity);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch activity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = resolvedParams?.id;
  const isUuid = typeof id === "string" && /^[0-9a-fA-F-]{36}$/.test(id);
  if (!isUuid) {
    return NextResponse.json({ error: "Invalid activity id." }, { status: 400 });
  }

  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role === "guest") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (role !== "admin" && role !== "vendor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body?.title === "string") {
    const trimmed = body.title.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    if (trimmed.length > 255) {
      return NextResponse.json({ error: "Title is too long (max 255 characters)" }, { status: 400 });
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
      return NextResponse.json({ error: "Category cannot be empty" }, { status: 400 });
    }
    updates.category = trimmed;
  }
  if (typeof body?.duration_hours !== "undefined") {
    if (body.duration_hours === null) {
      updates.duration_hours = null;
    } else if (typeof body.duration_hours === "number" && !Number.isNaN(body.duration_hours) && body.duration_hours >= 0) {
      updates.duration_hours = body.duration_hours;
    } else {
      return NextResponse.json({ error: "duration_hours must be a non-negative number or null" }, { status: 400 });
    }
  }
  if (typeof body?.price_per_person !== "undefined") {
    if (body.price_per_person === null) {
      updates.price_per_person = null;
    } else if (typeof body.price_per_person === "number" && !Number.isNaN(body.price_per_person) && body.price_per_person >= 0) {
      updates.price_per_person = body.price_per_person;
    } else {
      return NextResponse.json({ error: "price_per_person must be a non-negative number or null" }, { status: 400 });
    }
  }
  if (typeof body?.max_capacity !== "undefined") {
    if (body.max_capacity === null) {
      updates.max_capacity = null;
    } else if (typeof body.max_capacity === "number" && Number.isInteger(body.max_capacity) && body.max_capacity >= 1) {
      updates.max_capacity = body.max_capacity;
    } else {
      return NextResponse.json({ error: "max_capacity must be a positive integer or null" }, { status: 400 });
    }
  }
  if (typeof body?.image_url !== "undefined") {
    updates.image_url = typeof body.image_url === "string" ? body.image_url.trim() || null : null;
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
      return NextResponse.json({ error: coordPairError }, { status: 400 });
    }
  } else if (latPresent || lngPresent) {
    return NextResponse.json({ error: coordPairError }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  try {
    const isAdmin = role === "admin";
    const data = await updateActivity(supabase, id, updates, { isAdmin });
    return NextResponse.json({ id: data.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update activity";
    if (message === "Unauthorized" || message === "User is not associated with a vendor") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("PGRST116")) {
      return NextResponse.json({ error: "Activity not found or access denied" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = resolvedParams?.id;
  const isUuid = typeof id === "string" && /^[0-9a-fA-F-]{36}$/.test(id);
  if (!isUuid) {
    return NextResponse.json({ error: "Invalid activity id." }, { status: 400 });
  }

  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role === "guest") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (role !== "admin" && role !== "vendor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const deleted = await deleteActivity(supabase, id, { isAdmin: role === "admin" });
    return NextResponse.json(deleted, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete activity";
    if (message === "Unauthorized" || message === "User is not associated with a vendor") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "Row not found" || message.includes("PGRST116")) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}