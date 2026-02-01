import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";

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

  const { data, error } = await supabase
    .from("activities")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
