import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";

export type UserRole = "guest" | "user" | "vendor" | "admin";

export type RoleFlags = {
  canAccessAccount: boolean;
  canUploadActivities: boolean;
  canUploadAccommodations: boolean;
  canManageUsers: boolean;
  canManageVendors: boolean;
};

export const roleFlags: Record<UserRole, RoleFlags> = {
  guest: {
    canAccessAccount: false,
    canUploadActivities: false,
    canUploadAccommodations: false,
    canManageUsers: false,
    canManageVendors: false,
  },
  user: {
    canAccessAccount: true,
    canUploadActivities: false,
    canUploadAccommodations: false,
    canManageUsers: false,
    canManageVendors: false,
  },
  vendor: {
    canAccessAccount: true,
    canUploadActivities: true,
    canUploadAccommodations: true,
    canManageUsers: false,
    canManageVendors: false,
  },
  admin: {
    canAccessAccount: true,
    canUploadActivities: true,
    canUploadAccommodations: true,
    canManageUsers: true,
    canManageVendors: true,
  },
};

export function getRoleFlags(role: UserRole) {
  return roleFlags[role];
}

export async function getUserRole(
  supabase: SupabaseClient<Database>,
): Promise<UserRole> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return "guest";
  }

  const { data: adminRow } = await supabase
    .from("site_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminRow) {
    return "admin";
  }

  const { data: vendorRow } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (vendorRow) {
    return "vendor";
  }

  return "user";
}
