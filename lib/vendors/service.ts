import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";

export type Vendor = Database["public"]["Tables"]["vendors"]["Row"];

export type UpdateVendorProfileInput = Partial<
  Pick<
    Vendor,
    | "name"
    | "owner_full_name"
    | "business_phone"
    | "personal_phone"
    | "contact_email"
    | "is_incorporated"
    | "country_of_incorporation"
    | "business_registration_number"
  >
>;

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

export async function updateVendorProfile(
  supabase: SupabaseClient<Database>,
  input: UpdateVendorProfileInput,
) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Unauthorized");

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_user_id", userData.user.id)
    .maybeSingle();

  if (vendorError) throw new Error(vendorError.message);
  if (!vendor) throw new Error("User is not associated with a vendor");

  const payload: Database["public"]["Tables"]["vendors"]["Update"] = {};
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.owner_full_name !== undefined) payload.owner_full_name = input.owner_full_name;
  if (input.business_phone !== undefined) payload.business_phone = input.business_phone;
  if (input.personal_phone !== undefined) payload.personal_phone = input.personal_phone;
  if (input.contact_email !== undefined) payload.contact_email = input.contact_email;
  if (input.is_incorporated !== undefined) payload.is_incorporated = input.is_incorporated;
  if (input.country_of_incorporation !== undefined)
    payload.country_of_incorporation = input.country_of_incorporation;
  if (input.business_registration_number !== undefined)
    payload.business_registration_number = input.business_registration_number;

  if (Object.keys(payload).length === 0) {
    throw new Error("No fields to update");
  }

  const { data, error } = await supabase
    .from("vendors")
    .update(payload)
    .eq("id", vendor.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Vendor;
}
