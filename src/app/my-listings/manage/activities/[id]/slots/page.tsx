import Link from "next/link";
import { Header } from "@/components/layout/header";
import { ManageListingStatePage } from "../../../_shared/ManageListingStatePage";
import { ActivitySlotsManager } from "../ActivitySlotsManager";
import { getManagedActivityPageData } from "../managed-activity";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManageActivitySlotsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const redirectTo = `/my-listings/manage/activities/${resolvedParams.id}/slots`;
  const pageData = await getManagedActivityPageData(
    resolvedParams.id,
    redirectTo,
  );

  if ("error" in pageData) {
    return (
      <ManageListingStatePage
        title={pageData.error.title}
        message={pageData.error.message}
      />
    );
  }

  const { activity } = pageData;

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50 px-6 pb-16 pt-32 text-[#193059]">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#407FC2]">
                  Activity Slots
                </p>
                <h1
                  className="mt-2 text-3xl font-semibold"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {activity.title}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  {activity.location ?? "No location set"}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/my-listings/manage/activities/${activity.id}`}
                  className="rounded-lg border border-[#407FC2] px-4 py-2 text-sm font-medium text-[#407FC2] transition-colors hover:bg-[#407FC2] hover:text-white"
                >
                  Edit Activity
                </Link>
                <Link
                  href="/my-listings"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Back to My Listings
                </Link>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <ActivitySlotsManager activityId={activity.id} />
          </section>
        </div>
      </div>
    </>
  );
}
