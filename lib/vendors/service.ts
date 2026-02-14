import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";

export type Vendor = {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
};

export async function getVendorByOwner(
  supabase: SupabaseClient<Database>,
  ownerUserId: string,
) {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createVendor(
  supabase: SupabaseClient<Database>,
  input: { owner_user_id: string; name: string },
) {
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      owner_user_id: input.owner_user_id,
      name: input.name.trim(),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Vendor;
}
