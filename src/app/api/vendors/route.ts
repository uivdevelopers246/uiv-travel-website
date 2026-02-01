import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createVendor, getVendorByOwner } from "@/lib/vendors/service";

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Vendor name is required" },
      { status: 400 },
    );
  }

  try {
    const existing = await getVendorByOwner(supabase, userData.user.id);
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const created = await createVendor(supabase, {
      owner_user_id: userData.user.id,
      name,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    const message = error?.message ?? "Failed to create vendor";
    const status = message.includes("duplicate key") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
