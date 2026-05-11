"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { redirectToLogin } from "@/app/_shared/client-auth";
import { getSemanticNoticeClasses } from "@/app/_shared/client-tone";
import {
  formatCurrencyFromCents,
  formatParticipantsLabel,
  formatSlotDateTime,
} from "@/lib/utils/formatting";
import type { BuyerFlowMessage } from "@/lib/orders/buyer-flow";
import { collectOrderStatusAlerts } from "@/lib/orders/status-alerts";
import type { OrderWithActivityBookingsPaymentPreview } from "@/lib/orders/types";
import {
  type BookingDisplayState,
  type CountdownState,
  type UiTone,
  getOrderIdsToPoll,
  getOrderCardState,
  mergePolledOrderResults,
  shouldOrdersPoll,
} from "./my-bookings-ui";

const BOOKING_REFRESH_INTERVAL_MS = 30_000;

const orderDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

type Toast = {
  id: number;
  tone: "success" | "warning" | "error";
  message: string;
};

type MyBookingsClientProps = {
  initialReturnMessage?: BuyerFlowMessage | null;
};

type RefreshMode = "full" | "poll";

function formatDurationCountdown(remainingMs: number) {
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left`;
}

function formatCountdownLabel(
  countdown: CountdownState,
  prefix: string,
) {
  if (countdown.kind === "active") {
    return `${prefix}: ${formatDurationCountdown(countdown.remainingMs)}`;
  }

  if (countdown.kind === "expired") {
    return countdown.message;
  }

  return null;
}

function getToneClasses(tone: UiTone) {
  switch (tone) {
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "rose":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "sky":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "slate":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function getToastClasses(tone: Toast["tone"]) {
  return getSemanticNoticeClasses(tone);
}

async function fetchOrders(
  orderId?: string,
): Promise<OrderWithActivityBookingsPaymentPreview[]> {
  const path = orderId
    ? `/api/orders?orderId=${encodeURIComponent(orderId)}`
    : "/api/orders";
  const response = await fetch(path, {
    cache: "no-store",
  });

  if (response.status === 401) {
    redirectToLogin("/my-trip/bookings");
    return [];
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to load your bookings right now.",
    );
  }

  if (!Array.isArray(payload)) {
    throw new Error("Unexpected response while loading your bookings.");
  }

  return payload as OrderWithActivityBookingsPaymentPreview[];
}

async function fetchOrder(
  orderId: string,
): Promise<OrderWithActivityBookingsPaymentPreview | null> {
  const orders = await fetchOrders(orderId);
  return orders[0] ?? null;
}

async function pollOrders(
  currentOrders: OrderWithActivityBookingsPaymentPreview[],
): Promise<OrderWithActivityBookingsPaymentPreview[]> {
  const orderIds = getOrderIdsToPoll(currentOrders);
  if (orderIds.length === 0) {
    return currentOrders;
  }

  const results = await Promise.allSettled(orderIds.map((orderId) => fetchOrder(orderId)));
  return mergePolledOrderResults(
    currentOrders,
    orderIds.map((orderId, index) => ({
      orderId,
      result: results[index]!,
    })),
  );
}

async function createPaymentRecoverySession(orderId: string): Promise<string> {
  const response = await fetch(`/api/orders/${orderId}/payment-recovery`, {
    method: "POST",
  });

  if (response.status === 401) {
    redirectToLogin("/my-trip/bookings");
    return "";
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to start payment recovery right now.",
    );
  }

  if (!payload || typeof payload.url !== "string" || payload.url.trim() === "") {
    throw new Error("Unable to start payment recovery right now.");
  }

  return payload.url;
}

type BookingLineProps = {
  bookingState: BookingDisplayState;
  showCountdown: boolean;
};

function BookingLine({ bookingState, showCountdown }: BookingLineProps) {
  const countdownLabel = showCountdown
    ? formatCountdownLabel(bookingState.countdown, "Approval window")
    : null;

  return (
    <article className="rounded-[24px] border border-[#d8e5f2] bg-[#f8fbfe] p-5">
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
          <div className="h-40 w-full shrink-0 overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#dbe8f6_0%,#8ec7ff_48%,#193059_100%)] shadow-[0_14px_36px_rgba(25,48,89,0.12)] sm:h-28 sm:w-28">
            {bookingState.booking.activity_image_url ? (
              <img
                src={bookingState.booking.activity_image_url}
                alt={bookingState.booking.activity_title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.5),transparent_55%)] p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
                  Booking
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start gap-2">
              <h3
                className="min-w-0 flex-1 text-2xl font-bold text-[#193059]"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {bookingState.booking.activity_title}
              </h3>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${getToneClasses(
                  bookingState.tone,
                )}`}
              >
                {bookingState.statusLabel}
              </span>
              {countdownLabel ? (
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getToneClasses(
                    bookingState.countdown.kind === "expired"
                      ? "rose"
                      : "amber",
                  )}`}
                >
                  {countdownLabel}
                </span>
              ) : null}
            </div>

            <p className="text-sm font-medium leading-6 text-slate-700">
              {bookingState.detail}
            </p>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-[20px] border border-[#d8e5f2] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Slot
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#193059]">
                  {formatSlotDateTime(
                    bookingState.booking.slot_starts_at,
                    bookingState.booking.slot_ends_at,
                  )}
                </p>
              </div>

              <div className="rounded-[20px] border border-[#d8e5f2] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Participants
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#193059]">
                  {formatParticipantsLabel(bookingState.booking.participants)}
                </p>
              </div>

              <div className="rounded-[20px] border border-[#d8e5f2] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Booking total
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#193059]">
                  {formatCurrencyFromCents(bookingState.booking.total_cents)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function MyBookingsClient({
  initialReturnMessage = null,
}: MyBookingsClientProps) {
  const [orders, setOrders] = useState<OrderWithActivityBookingsPaymentPreview[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshMode, setRefreshMode] = useState<RefreshMode>("full");
  const [now, setNow] = useState(() => Date.now());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recoveringOrderId, setRecoveringOrderId] = useState<string | null>(null);
  const returnMessage = initialReturnMessage;
  const hasLoadedRef = useRef(false);
  const previousOrdersRef = useRef<OrderWithActivityBookingsPaymentPreview[]>([]);

  function requestRefresh(mode: RefreshMode) {
    setRefreshMode(mode);
    setReloadToken((value) => value + 1);
  }

  function pushToast(tone: Toast["tone"], message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  }

  useEffect(() => {
    let active = true;
    const isInitialLoad = !hasLoadedRef.current;

    if (isInitialLoad) {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }

    void (async () => {
      try {
        const nextOrders =
          refreshMode === "poll" && hasLoadedRef.current
            ? await pollOrders(previousOrdersRef.current)
            : await fetchOrders();
        if (!active) {
          return;
        }

        if (hasLoadedRef.current) {
          const alerts = collectOrderStatusAlerts(
            previousOrdersRef.current,
            nextOrders,
          );

          for (const alert of alerts) {
            pushToast(alert.tone, alert.message);
          }
        }

        hasLoadedRef.current = true;
        previousOrdersRef.current = nextOrders;
        setOrders(nextOrders);
        setError(null);
      } catch (nextError: unknown) {
        if (!active) {
          return;
        }

        const message =
          nextError instanceof Error
            ? nextError.message
            : "Unable to load your bookings right now.";

        if (isInitialLoad) {
          setOrders([]);
          setError(message);
        } else {
          pushToast(
            "error",
            `Unable to refresh booking statuses right now. ${message}`,
          );
        }
      } finally {
        if (!active) {
          return;
        }

        if (isInitialLoad) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [reloadToken, refreshMode]);

  const orderCards = orders.map((order) => getOrderCardState(order, now));
  const shouldPoll = shouldOrdersPoll(orders);
  const hasActiveCountdowns = orderCards.some((card) => card.hasActiveCountdown);

  useEffect(() => {
    const url = new URL(window.location.href);
    const checkoutState = url.searchParams.get("checkout");
    const paymentRecoveryState = url.searchParams.get("payment_recovery");
    const shouldRefreshImmediately =
      checkoutState === "success" ||
      checkoutState === "pending" ||
      paymentRecoveryState === "updated";

    if (!shouldRefreshImmediately) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRefreshMode("full");
      setReloadToken((value) => value + 1);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (loading || !shouldPoll) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRefreshMode("poll");
      setReloadToken((value) => value + 1);
    }, BOOKING_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loading, shouldPoll]);

  useEffect(() => {
    if (!hasActiveCountdowns) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveCountdowns]);

  useEffect(() => {
    if (!initialReturnMessage) {
      return;
    }

    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ["checkout", "payment_recovery", "order_id"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }

    if (changed) {
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [initialReturnMessage]);

  async function handlePaymentRecovery(orderId: string) {
    try {
      setRecoveringOrderId(orderId);
      const url = await createPaymentRecoverySession(orderId);
      if (url) {
        window.location.assign(url);
      }
    } catch (nextError: unknown) {
      pushToast(
        "error",
        nextError instanceof Error
          ? nextError.message
          : "Unable to start payment recovery right now.",
      );
    } finally {
      setRecoveringOrderId((current) => (current === orderId ? null : current));
    }
  }

  function refreshBookings() {
    requestRefresh("full");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9fd_0%,#ffffff_42%,#eef5fb_100%)] pt-28">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 pb-16 lg:px-6">
        <section className="rounded-[32px] bg-[#193059] px-6 py-8 text-white shadow-[0_30px_80px_rgba(25,48,89,0.18)] md:px-8">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-[#8ec7ff]">
            <span>My Trip</span>
            <Link
              href="/cart"
              className="rounded-full border border-white/15 px-5 py-2 text-xs tracking-[0.24em] text-white/78 transition-colors hover:bg-white/10"
            >
              Cart
            </Link>
            <span className="rounded-full bg-white/12 px-5 py-2 text-xs tracking-[0.24em] text-white">
              Bookings
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1
                className="text-4xl font-bold md:text-5xl"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Your bookings
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72 md:text-base">
                See what is still waiting on vendors, what has already been confirmed, when payment
                is involved, and exactly what to do next for each order.
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/62">
                {loading
                  ? "Loading your latest booking statuses"
                  : shouldPoll
                    ? "Statuses refresh automatically while vendor or payment updates are still in progress."
                    : "All current orders are settled. Refresh any time if you want to check again."}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
              <button
                type="button"
                onClick={refreshBookings}
                disabled={loading || refreshing}
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading || refreshing ? "Refreshing..." : "Refresh status"}
              </button>
              <Link
                href="/vacation-planning"
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Explore activities
              </Link>
            </div>
          </div>
        </section>

        {returnMessage ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm ${getToastClasses(
              returnMessage.tone,
            )}`}
          >
            {returnMessage.message}
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-[28px] border border-[#d8e5f2] bg-white p-8 shadow-[0_20px_60px_rgba(25,48,89,0.08)]">
            <p className="text-sm text-slate-600">Loading your bookings...</p>
          </section>
        ) : error ? (
          <section className="rounded-[28px] border border-rose-200 bg-white p-8 shadow-[0_20px_60px_rgba(25,48,89,0.08)]">
            <p className="text-sm text-rose-700">{error}</p>
            <button
              type="button"
              onClick={refreshBookings}
              className="mt-4 inline-flex rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
            >
              Retry
            </button>
          </section>
        ) : orders.length === 0 ? (
          <section className="rounded-[28px] border border-[#d8e5f2] bg-white p-10 text-center shadow-[0_20px_60px_rgba(25,48,89,0.08)]">
            <h2
              className="text-3xl font-bold text-[#193059]"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              No bookings yet
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Booking requests only appear here after checkout is completed. If you still have
              items in your cart, they are not bookings yet until your payment method is saved and
              the request is submitted.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/vacation-planning"
                className="inline-flex rounded-full bg-gradient-to-r from-[#407FC2] to-[#193059] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
              >
                Explore activities
              </Link>
              <Link
                href="/cart"
                className="inline-flex rounded-full border border-[#193059] px-6 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#193059] hover:text-white"
              >
                View cart
              </Link>
            </div>
          </section>
        ) : (
          <section className="space-y-6">
            {orderCards.map((card) => {
              const orderCountdownLabel = formatCountdownLabel(
                card.countdown,
                "Earliest deadline",
              );
              const bookingCountLabel = card.isFinalizing
                ? "Booking items still syncing"
                : `${card.order.activity_bookings.length} ${
                    card.order.activity_bookings.length === 1
                      ? "activity booking"
                      : "activity bookings"
                  }`;

              return (
                <article
                  key={card.order.id}
                  className="rounded-[28px] border border-[#d8e5f2] bg-white p-6 shadow-[0_20px_60px_rgba(25,48,89,0.08)]"
                >
                  <div className="flex flex-col gap-5 border-b border-[#e5eef7] pb-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                            Order {card.order.id.slice(0, 8)}
                          </p>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${getToneClasses(
                              card.phase.tone,
                            )}`}
                          >
                            {card.phase.label}
                          </span>
                        </div>

                        <div>
                          <h2
                            className="text-3xl font-bold text-[#193059]"
                            style={{ fontFamily: "var(--font-playfair)" }}
                          >
                            {bookingCountLabel}
                          </h2>
                          <p className="mt-2 text-sm text-slate-600">
                            Placed {orderDateFormatter.format(new Date(card.order.created_at))}
                          </p>
                        </div>

                        {card.pendingApprovalSummary || orderCountdownLabel ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {card.pendingApprovalSummary ? (
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                                {card.pendingApprovalSummary}
                              </span>
                            ) : null}
                            {orderCountdownLabel ? (
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getToneClasses(
                                  card.countdown.kind === "expired"
                                    ? "rose"
                                    : "amber",
                                )}`}
                              >
                                {orderCountdownLabel}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                        <div className="grid gap-3 rounded-[24px] bg-[#f4f8fc] p-4 text-sm text-slate-600 sm:min-w-[240px]">
                        <div className="flex items-center justify-between gap-4">
                          <span>Order total</span>
                          <span className="font-semibold text-[#193059]">
                            {formatCurrencyFromCents(card.order.total_cents)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Bookings</span>
                          <span className="font-semibold text-[#193059]">
                            {card.isFinalizing
                              ? "Syncing..."
                              : card.order.activity_bookings.length}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`rounded-[24px] border px-5 py-4 ${getToneClasses(
                        card.notice.tone,
                      )}`}
                    >
                      {(() => {
                        const showDetailBoxes =
                          card.notice.actions.receiptUrl != null ||
                          card.notice.actions.canRetry ||
                          card.notice.actions.showContactSupport ||
                          card.notice.failureMessage != null ||
                          card.phase.kind === "payment_failed" ||
                          card.phase.kind === "support_review";
                        const compactNotice =
                          card.phase.kind === "vendor_review"
                            ? "No charge yet. We only charge confirmed bookings after vendors respond."
                            : card.phase.kind === "payment_processing"
                              ? "Charge in progress. This order updates automatically."
                              : card.phase.kind === "finalizing"
                                ? "We are still attaching booking details to this order."
                                : card.phase.kind === "payment_complete"
                                  ? "Payment completed successfully."
                                  : card.phase.kind === "no_payment_collected"
                                    ? "No payment was collected for this order."
                                    : `${card.notice.paymentLabel} ${card.notice.nextStepLabel}`;

                        return (
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex-1 space-y-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em]">
                              Order status
                            </p>
                            <h3 className="mt-3 text-xl font-semibold text-current">
                              {card.notice.title}
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-current/90">
                              {card.notice.message}
                            </p>
                          </div>

                          {showDetailBoxes ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded-[20px] border border-current/10 bg-white/70 px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-current/70">
                                  Payment
                                </p>
                                <p className="mt-2 text-sm font-medium leading-6 text-current">
                                  {card.notice.paymentLabel}
                                </p>
                              </div>
                              <div className="rounded-[20px] border border-current/10 bg-white/70 px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-current/70">
                                  Next step
                                </p>
                                <p className="mt-2 text-sm font-medium leading-6 text-current">
                                  {card.notice.nextStepLabel}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm font-medium leading-6 text-current/90">
                              {compactNotice}
                            </p>
                          )}

                          {card.notice.failureMessage ? (
                            <div className="rounded-[20px] border border-current/10 bg-white/70 px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-current/70">
                                Failure reason
                              </p>
                              <p className="mt-2 text-sm font-medium leading-6 text-current">
                                {card.notice.failureMessage}
                              </p>
                            </div>
                          ) : null}
                        </div>

                        {card.notice.actions.receiptUrl ||
                        card.notice.actions.canRetry ||
                        card.notice.actions.showContactSupport ? (
                          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-[260px] xl:grid-cols-1">
                            {card.notice.actions.receiptUrl ? (
                              <a
                                href={card.notice.actions.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex w-full items-center justify-center rounded-full border border-current/25 bg-white/70 px-4 py-3 text-sm font-semibold text-current transition-colors hover:bg-white"
                              >
                                View receipt
                              </a>
                            ) : null}

                            {card.notice.actions.canRetry ? (
                              <button
                                type="button"
                                onClick={() => void handlePaymentRecovery(card.order.id)}
                                disabled={recoveringOrderId === card.order.id}
                                className="inline-flex w-full items-center justify-center rounded-full border border-current/25 bg-white/70 px-4 py-3 text-sm font-semibold text-current transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {recoveringOrderId === card.order.id
                                  ? "Opening payment update..."
                                  : "Update payment method"}
                              </button>
                            ) : null}

                            {card.notice.actions.showContactSupport ? (
                              <Link
                                href="/contact"
                                className="inline-flex w-full items-center justify-center rounded-full border border-current/25 bg-white/70 px-4 py-3 text-sm font-semibold text-current transition-colors hover:bg-white"
                              >
                                Contact support
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {card.isFinalizing ? (
                      <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5 text-sm leading-6 text-sky-900">
                        We&apos;re still creating the booking items for this order after checkout.
                        Refresh is automatic while the request is being attached to your account.
                      </div>
                    ) : (
                      card.bookingStates.map((bookingState) => (
                        <BookingLine
                          key={bookingState.booking.id}
                          bookingState={bookingState}
                          showCountdown={card.pendingApprovalCount > 1}
                        />
                      ))
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-medium shadow-[0_16px_32px_rgba(25,48,89,0.18)] ${getToastClasses(
              toast.tone,
            )}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}
