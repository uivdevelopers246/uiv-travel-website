import Link from "next/link";
import { Header } from "@/components/layout/header";
import { BOOKING_APPROVAL_SLA_HOURS } from "@/lib/activity-bookings/sla";

export default function CheckoutSuccessPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9fd_0%,#ffffff_40%,#eef5fb_100%)] px-4 pb-16 pt-28">
        <div className="mx-auto max-w-4xl">
          <section className="overflow-hidden rounded-[32px] border border-[#d8e5f2] bg-white shadow-[0_24px_80px_rgba(25,48,89,0.12)]">
            <div className="bg-[#193059] px-6 py-8 text-white md:px-10">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8ec7ff]">
                Checkout Complete
              </p>
              <h1
                className="mt-4 text-4xl font-bold md:text-5xl"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Booking request submitted
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/75 md:text-base">
                Your payment method has been saved securely in Stripe. No charge has been made yet.
              </p>
            </div>

            <div className="grid gap-6 px-6 py-8 md:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.9fr)] md:px-10">
              <div>
                <h2
                  className="text-2xl font-bold text-[#193059]"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  What happens next
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-600 md:text-base">
                  We&apos;ve sent your booking request for review. Vendors have up to{" "}
                  {BOOKING_APPROVAL_SLA_HOURS} hours to approve or decline based on live
                  availability. If approved, your saved payment method will be charged after the
                  review is complete.
                </p>
                <p className="mt-4 text-sm leading-7 text-slate-600 md:text-base">
                  If a request is declined or expires, you will not be charged for that item.
                </p>
              </div>

              <aside className="rounded-[28px] bg-[#f4f8fc] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                  Status
                </p>
                <p className="mt-3 text-2xl font-semibold text-[#193059]">
                  Pending approval
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  You can keep planning your trip while the request is reviewed.
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link
                    href="/vacation-planning"
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#407FC2] to-[#193059] px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
                  >
                    Keep browsing
                  </Link>
                  <Link
                    href="/my-trip/bookings"
                    className="inline-flex items-center justify-center rounded-full border border-[#c8d9ea] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#f4f8fc]"
                  >
                    View bookings
                  </Link>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
