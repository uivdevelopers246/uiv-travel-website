import Link from "next/link";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { ManageListingStatePage } from "../../../_shared/ManageListingStatePage";
import {
  getCurrentVendorIdForManage,
  isValidUuid,
  requireManageListingAccess,
} from "../../../_shared/server";
import { AccommodationCalendarManager } from "./AccommodationCalendarManager";

export default async function AccommodationCalendarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return <ManageListingStatePage title="Invalid accommodation" message="The accommodation link is invalid." />;
  }

  const supabase = await createClient();
  const redirectTo = `/my-listings/manage/accommodations/${id}/calendar`;
  const role = await requireManageListingAccess(supabase, redirectTo);
  if (!role) {
    return <ManageListingStatePage title="Access denied" message="You need admin or vendor access to manage accommodations." />;
  }

  const vendorId = role === "vendor"
    ? await getCurrentVendorIdForManage(supabase, redirectTo)
    : null;
  if (role === "vendor" && !vendorId) {
    return <ManageListingStatePage title="Vendor profile required" message="You need a vendor profile to manage accommodations." />;
  }

  let query = supabase.from("accommodations").select("id, name, parish, address").eq("id", id);
  if (vendorId) query = query.eq("vendor_id", vendorId);
  const { data: accommodation, error } = await query.maybeSingle();
  if (error) {
    return <ManageListingStatePage title="Unable to load accommodation" message="Please refresh the page and try again." />;
  }
  if (!accommodation) {
    return <ManageListingStatePage title="Accommodation not found" message="We couldn't find that accommodation." />;
  }

  const firstNight = new Date().toISOString().slice(0, 10);
  const lastNight = new Date(Date.parse(`${firstNight}T00:00:00Z`) + 29 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 px-4 pb-16 pt-32 text-[#193059] sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#407FC2]">Calendar &amp; prices</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-playfair)" }}>{accommodation.name}</h1>
            <p className="mt-2 text-sm text-slate-600">{accommodation.parish ?? accommodation.address ?? "No location set"}</p>
            <nav aria-label="Accommodation management" className="mt-5 flex flex-wrap gap-3">
              <Link href={`/my-listings/bookings?accommodationId=${id}`} className="rounded-lg bg-[#193059] px-4 py-2 text-sm font-semibold text-white hover:bg-[#407FC2]">Manage bookings</Link>
              <Link href={`/my-listings/manage/accommodations/${id}`} className="rounded-lg border border-[#407FC2] px-4 py-2 text-sm font-medium text-[#407FC2] hover:bg-blue-50">Edit accommodation</Link>
              <Link href="/my-listings" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">My listings</Link>
            </nav>
          </section>
          <AccommodationCalendarManager accommodationId={id} initialFirstNight={firstNight} initialLastNight={lastNight} />
        </div>
      </main>
    </>
  );
}
