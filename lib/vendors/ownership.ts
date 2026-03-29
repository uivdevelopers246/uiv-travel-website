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

export async function getOwnedVendorIdOrThrow(
  supabase: SupabaseClient<Database>,
  ownerUserId?: string,
) {
  const resolvedOwnerUserId = ownerUserId ?? (await getCurrentUserIdOrThrow(supabase));

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
