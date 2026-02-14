import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import { updateActivity } from "@/lib/activities/service";

const allowedStatuses = new Set(["draft", "published"]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role === "guest") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (role !== "admin" && role !== "vendor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const id = typeof body?.id === "string" ? body.id : null;
  const status = typeof body?.status === "string" ? body.status : null;

  if (!id || !status || !allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Validate UUID format
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(id);
  if (!isUuid) {
    return NextResponse.json({ error: "Invalid activity id" }, { status: 400 });
  }

  try {
    // Use updateActivity service which validates vendor ownership
    const data = await updateActivity(supabase, id, { status: status as "draft" | "published" });
    return NextResponse.json({ id: data.id, status: data.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update status";
    if (message === "Unauthorized" || message === "User is not associated with a vendor") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("PGRST116")) {
      return NextResponse.json({ error: "Activity not found or access denied" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
