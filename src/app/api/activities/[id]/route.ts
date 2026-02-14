import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { getActivityById, deleteActivity, updateActivity } from "@/lib/activities/service";


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

  const body = await req.json();
  const updates: Record<string, any> = {};

  if (typeof body?.title === "string") updates.title = body.title;
  if (typeof body?.description !== "undefined") updates.description = body.description ?? null;
  if (typeof body?.location !== "undefined") updates.location = body.location ?? null;
  if (typeof body?.category === "string") updates.category = body.category;
  if (typeof body?.duration_hours !== "undefined")
    updates.duration_hours = body.duration_hours ?? null;
  if (typeof body?.price_per_person !== "undefined")
    updates.price_per_person = body.price_per_person ?? null;
  if (typeof body?.max_capacity !== "undefined")
    updates.max_capacity = body.max_capacity ?? null;
  if (typeof body?.image_url !== "undefined") updates.image_url = body.image_url ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  try {
    const data = await updateActivity(supabase, id, updates);
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
    const deleted = await deleteActivity(supabase, id);
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