import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserRole, type UserRole } from "@/lib/auth/roles";
import type { Database } from "@/supabase/types/database";

type ManageRole = Extract<UserRole, "admin" | "vendor">;

export function isValidUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

export async function requireManageListingAccess(
  supabase: SupabaseClient<Database>,
  redirectTo: string,
): Promise<ManageRole | null> {
  const role = await getUserRole(supabase);

  if (role === "guest") {
    redirect(`/auth/login?redirect=${redirectTo}`);
  }

  if (role !== "admin" && role !== "vendor") {
    return null;
  }

  return role;
}

export async function getCurrentVendorIdForManage(
  supabase: SupabaseClient<Database>,
  redirectTo: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?redirect=${redirectTo}`);
  }

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return vendor?.id ?? null;
}
