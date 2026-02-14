import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";

type ActionName = "make_admin" | "remove_admin" | "make_vendor" | "remove_vendor";

export async function POST(req: Request) {
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const action = body?.action as ActionName | undefined;
  const userId = typeof body?.user_id === "string" ? body.user_id : null;
  const vendorName = typeof body?.vendor_name === "string" ? body.vendor_name.trim() : "";

  if (!action || !userId) {
    return NextResponse.json({ error: "Missing action or user_id" }, { status: 400 });
  }

  if (action === "remove_admin") {
    const { data: currentUser } = await supabase.auth.getUser();
    if (currentUser.user?.id === userId) {
      return NextResponse.json(
        { error: "You cannot remove your own admin access." },
        { status: 400 },
      );
    }
  }

  try {
    switch (action) {
      case "make_admin": {
        const { error } = await supabase
          .from("site_admins")
          .insert({ user_id: userId });
        if (error) throw error;
        break;
      }
      case "remove_admin": {
        const { error } = await supabase
          .from("site_admins")
          .delete()
          .eq("user_id", userId);
        if (error) throw error;
        break;
      }
      case "make_vendor": {
        if (!vendorName) {
          return NextResponse.json(
            { error: "Vendor name is required" },
            { status: 400 },
          );
        }
        if (vendorName.length > 255) {
          return NextResponse.json(
            { error: "Vendor name is too long (max 255 characters)" },
            { status: 400 },
          );
        }
        const { error } = await supabase
          .from("vendors")
          .insert({ owner_user_id: userId, name: vendorName });
        if (error) throw error;
        break;
      }
      case "remove_vendor": {
        const { error } = await supabase
          .from("vendors")
          .delete()
          .eq("owner_user_id", userId);
        if (error) throw error;
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
