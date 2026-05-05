"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getCheckoutSuccessState,
  getOrderStatusNotice,
} from "@/lib/orders/buyer-flow";
import type { OrderWithActivityBookingsPaymentPreview } from "@/lib/orders/types";

const FINALIZE_REFRESH_INTERVAL_MS = 3_000;
const READY_REDIRECT_DELAY_MS = 2_000;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatCurrencyFromCents(value: number) {
  return currencyFormatter.format(value / 100);
}

function redirectToLogin(orderId: string | null) {
  const redirectPath = orderId
    ? `/checkout/success?order_id=${orderId}`
    : "/checkout/success";
  window.location.assign(`/auth/login?redirect=${encodeURIComponent(redirectPath)}`);
}

async function fetchOrder(
  orderId: string,
): Promise<OrderWithActivityBookingsPaymentPreview | null> {
  const response = await fetch(`/api/orders?orderId=${encodeURIComponent(orderId)}`, {
    cache: "no-store",
  });

  if (response.status === 401) {
    redirectToLogin(orderId);
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to load your order right now.",
    );
  }

  if (!Array.isArray(payload)) {
    throw new Error("Unexpected response while loading your order.");
  }

  return payload[0] ?? null;
}

type CheckoutSuccessClientProps = {
  orderId: string | null;
};

export function CheckoutSuccessClient({
  orderId,
}: CheckoutSuccessClientProps) {
  const [order, setOrder] = useState<OrderWithActivityBookingsPaymentPreview | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setOrder(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);

    void (async () => {
      try {
        const nextOrder = await fetchOrder(orderId);
        if (!active) {
          return;
        }

        setOrder(nextOrder);
        setError(null);
      } catch (nextError: unknown) {
        if (!active) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load your order right now.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [orderId, reloadToken]);

  const viewState = useMemo(
    () => (loading ? null : getCheckoutSuccessState(orderId, order)),
    [loading, order, orderId],
  );

  useEffect(() => {
    if (loading || !viewState || viewState.kind !== "finalizing") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setReloadToken((value) => value + 1);
    }, FINALIZE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loading, viewState]);

  useEffect(() => {
    if (!viewState || viewState.kind !== "submitted") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      window.location.assign("/my-trip/bookings?checkout=success");
    }, READY_REDIRECT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [viewState]);

  const statusNotice =
    viewState && "order" in viewState ? getOrderStatusNotice(viewState.order) : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9fd_0%,#ffffff_40%,#eef5fb_100%)] px-4 pb-16 pt-28">
      <div className="mx-auto max-w-4xl">
        <section className="overflow-hidden rounded-[32px] border border-[#d8e5f2] bg-white shadow-[0_24px_80px_rgba(25,48,89,0.12)]">
          <div className="bg-[#193059] px-6 py-8 text-white md:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8ec7ff]">
              Checkout Return
            </p>
            <h1
              className="mt-4 text-4xl font-bold md:text-5xl"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {loading
                ? "Checking your booking request"
                : viewState?.title ?? "Checking your booking request"}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/75 md:text-base">
              {loading
                ? "We're confirming this Stripe return and loading the matching order."
                : error
                  ? error
                  : viewState?.message}
            </p>
          </div>

          <div className="grid gap-6 px-6 py-8 md:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.9fr)] md:px-10">
            <div className="space-y-4">
              {statusNotice ? (
                <div
                  className={`rounded-[24px] border px-5 py-4 text-sm ${
                    statusNotice.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : statusNotice.tone === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.22em]">
                    {statusNotice.title}
                  </p>
                  <p className="mt-2">{statusNotice.message}</p>
                  {statusNotice.failureMessage ? (
                    <p className="mt-2">Reason: {statusNotice.failureMessage}</p>
                  ) : null}
                </div>
              ) : null}

              {viewState && "order" in viewState ? (
                <div className="rounded-[24px] border border-[#d8e5f2] bg-[#f8fbfe] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#407FC2]">
                    Order {viewState.order.id.slice(0, 8)}
                  </p>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Order total
                      </span>
                      <span className="mt-2 block text-xl font-semibold text-[#193059]">
                        {formatCurrencyFromCents(viewState.order.total_cents)}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Booking items
                      </span>
                      <span className="mt-2 block text-xl font-semibold text-[#193059]">
                        {viewState.order.activity_bookings.length}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {viewState?.kind === "finalizing" ? (
                <p className="text-sm leading-7 text-slate-600">
                  This usually resolves within a few seconds. If it takes longer, you can open My
                  Bookings and continue from there.
                </p>
              ) : null}
            </div>

            <aside className="rounded-[28px] bg-[#f4f8fc] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                Next step
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href={
                    viewState?.kind === "finalizing"
                      ? "/my-trip/bookings?checkout=pending"
                      : "/my-trip/bookings"
                  }
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#407FC2] to-[#193059] px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
                >
                  View My Bookings
                </Link>
                <Link
                  href="/vacation-planning"
                  className="inline-flex items-center justify-center rounded-full border border-[#c8d9ea] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#f4f8fc]"
                >
                  Keep browsing
                </Link>
                {statusNotice?.showContactSupport ? (
                  <Link
                    href="/contact"
                    className="inline-flex items-center justify-center rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    Contact support
                  </Link>
                ) : null}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
