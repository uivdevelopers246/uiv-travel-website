import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";

export async function getCurrentUserIdOrThrow(
  supabase: SupabaseClient<Database>,
) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error("Unauthorized");
  }

  return userData.user.id;
}

/**
 * Returns `vendors.id` for the vendor whose `owner_user_id` matches the caller,
 * or matches `forUserId` when provided (e.g. after `getCurrentUserIdOrThrow`).
 */
export async function getVendorIdForCurrentUser(
  supabase: SupabaseClient<Database>,
  forUserId?: string,
) {
  const resolvedOwnerUserId =
    forUserId ?? (await getCurrentUserIdOrThrow(supabase));

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_user_id", resolvedOwnerUserId)
    .maybeSingle();

  if (vendorError) throw new Error(vendorError.message);
  if (!vendor) {
    throw new Error("User is not associated with a vendor");
  }

  return vendor.id;
}
