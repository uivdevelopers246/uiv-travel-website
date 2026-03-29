import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { AccommodationFormClient } from "../[id]/AccommodationFormClient";
import { ManageListingStatePage } from "../../_shared/ManageListingStatePage";
import {
  getCurrentVendorIdForManage,
  requireManageListingAccess,
} from "../../_shared/server";

export default async function NewAccommodationPage() {
  const supabase = await createClient();
  const redirectTo = "/my-listings/manage/accommodations/new";
  const role = await requireManageListingAccess(supabase, redirectTo);

  if (!role) {
    return (
      <ManageListingStatePage
        title="Access denied"
        message="You need admin or vendor access to create accommodations."
      />
    );
  }

  const vendorId = await getCurrentVendorIdForManage(supabase, redirectTo);

  if (!vendorId) {
    return (
      <ManageListingStatePage
        title="Vendor profile required"
        message="You need a vendor profile to create accommodations. Please complete your vendor registration first."
      />
    );
  }

  return (
    <>
      <Header />
      <AccommodationFormClient mode="create" vendorId={vendorId} />
    </>
  );
}
