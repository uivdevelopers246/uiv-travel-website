import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ActivityFormClient } from "../[id]/ActivityFormClient";
import { ManageListingStatePage } from "../../_shared/ManageListingStatePage";
import {
  getCurrentVendorIdForManage,
  requireManageListingAccess,
} from "../../_shared/server";

export default async function NewActivityPage() {
  const supabase = await createClient();
  const redirectTo = "/my-listings/manage/activities/new";
  const role = await requireManageListingAccess(supabase, redirectTo);

  if (!role) {
    return (
      <ManageListingStatePage
        title="Access denied"
        message="You need admin or vendor access to create activities."
      />
    );
  }

  const vendorId = await getCurrentVendorIdForManage(supabase, redirectTo);

  if (!vendorId) {
    return (
      <ManageListingStatePage
        title="Vendor profile required"
        message="You need a vendor profile to create activities. Please complete your vendor registration first."
      />
    );
  }

  return (
    <>
      <Header />
      <ActivityFormClient mode="create" vendorId={vendorId} />
    </>
  );
}
