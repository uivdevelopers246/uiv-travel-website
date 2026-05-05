"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  type BuyerFlowMessage,
  getOrderStatusNotice,
} from "@/lib/orders/buyer-flow";
import { collectOrderStatusAlerts } from "@/lib/orders/status-alerts";
import type {
  ActivityBookingWithPreview,
  OrderWithActivityBookingsPaymentPreview,
} from "@/lib/orders/types";

const BOOKING_REFRESH_INTERVAL_MS = 30_000;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const orderDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const slotDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const slotTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function redirectToLogin() {
  window.location.assign("/auth/login?redirect=/my-trip/bookings");
}

function formatCurrencyFromCents(value: number) {
  return currencyFormatter.format(value / 100);
}

function formatStatusLabel(status: string) {
  return status
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatParticipants(count: number) {
  return `${count} ${count === 1 ? "participant" : "participants"}`;
}

function formatSlotDateTime(startsAt: string, endsAt: string) {
  if (!startsAt || !endsAt) {
    return "Date and time unavailable";
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return `${slotDateFormatter.format(start)} - ${slotTimeFormatter.format(start)} to ${slotTimeFormatter.format(end)}`;
}

function formatCountdown(deadlineAt: string | null, now: number) {
  if (!deadlineAt) {
    return null;
  }

  const deadlineMs = new Date(deadlineAt).getTime();
  if (Number.isNaN(deadlineMs)) {
    return null;
  }

  const remainingMs = deadlineMs - now;
  if (remainingMs <= 0) {
    return "SLA expired, awaiting status update";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left`;
}

function getOrderApprovalDeadlineAt(
  order: OrderWithActivityBookingsPaymentPreview,
): string | null {
  const pendingDeadlines = order.activity_bookings
    .filter((booking) => booking.status === "pending_approval")
    .map((booking) => booking.approval_deadline_at)
    .filter((deadline): deadline is string => typeof deadline === "string");

  if (pendingDeadlines.length === 0) {
    return null;
  }

  pendingDeadlines.sort((left, right) => left.localeCompare(right));
  return pendingDeadlines[0] ?? null;
}

function getOrderStatusClasses(status: string) {
  switch (status) {
    case "awaiting_payment":
    case "awaiting_vendor_approval":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "payment_pending":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "reconciliation_required":
    case "failed":
    case "cancelled":
    case "declined":
    case "expired":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function getBookingStatusClasses(status: string) {
  switch (status) {
    case "pending_approval":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "declined":
    case "expired":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "cancelled":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function getToastClasses(tone: Toast["tone"]) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "error":
    default:
      return "border-rose-200 bg-rose-50 text-rose-800";
  }
}

async function fetchOrders(): Promise<OrderWithActivityBookingsPaymentPreview[]> {
  const response = await fetch("/api/orders", {
    cache: "no-store",
  });

  if (response.status === 401) {
    redirectToLogin();
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

async function createPaymentRecoverySession(orderId: string): Promise<string> {
  const response = await fetch(`/api/orders/${orderId}/payment-recovery`, {
    method: "POST",
  });

  if (response.status === 401) {
    redirectToLogin();
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
  booking: ActivityBookingWithPreview;
};

type Toast = {
  id: number;
  tone: "success" | "warning" | "error";
  message: string;
};

function BookingLine({ booking }: BookingLineProps) {
  return (
    <article className="rounded-[24px] border border-[#d8e5f2] bg-[#f8fbfe] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#dbe8f6_0%,#8ec7ff_48%,#193059_100%)] shadow-[0_14px_36px_rgba(25,48,89,0.12)]">
            {booking.activity_image_url ? (
              <img
                src={booking.activity_image_url}
                alt={booking.activity_title}
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

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3
                className="text-2xl font-bold text-[#193059]"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {booking.activity_title}
              </h3>
              {booking.status !== "pending_approval" ? (
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${getBookingStatusClasses(
                    booking.status,
                  )}`}
                >
                  {formatStatusLabel(booking.status)}
                </span>
              ) : null}
            </div>

            <p className="text-sm text-slate-600">
              {formatSlotDateTime(booking.slot_starts_at, booking.slot_ends_at)}
            </p>
            <p className="text-sm text-slate-600">
              {formatParticipants(booking.participants)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white px-5 py-4 text-left shadow-[0_12px_32px_rgba(25,48,89,0.06)] lg:min-w-[180px]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Booking Total
          </p>
          <p className="mt-2 text-2xl font-semibold text-[#193059]">
            {formatCurrencyFromCents(booking.total_cents)}
          </p>
        </div>
      </div>
    </article>
  );
}

type MyBookingsClientProps = {
  initialReturnMessage?: BuyerFlowMessage | null;
};

export function MyBookingsClient({
  initialReturnMessage = null,
}: MyBookingsClientProps) {
  const [orders, setOrders] = useState<OrderWithActivityBookingsPaymentPreview[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recoveringOrderId, setRecoveringOrderId] = useState<string | null>(null);
  const returnMessage = initialReturnMessage;
  const hasLoadedRef = useRef(false);
  const previousOrdersRef = useRef<OrderWithActivityBookingsPaymentPreview[]>([]);

  useEffect(() => {
    let active = true;
    const isInitialLoad = !hasLoadedRef.current;

    if (isInitialLoad) {
      setLoading(true);
      setError(null);
    }

    void (async () => {
      try {
        const nextOrders = await fetchOrders();
        if (!active) {
          return;
        }

        if (hasLoadedRef.current) {
          const alerts = collectOrderStatusAlerts(
            previousOrdersRef.current,
            nextOrders,
          );

          for (const alert of alerts) {
            const id = Date.now() + Math.floor(Math.random() * 1000);
            setToasts((current) => [
              ...current,
              { id, tone: alert.tone, message: alert.message },
            ]);

            window.setTimeout(() => {
              setToasts((current) => current.filter((toast) => toast.id !== id));
            }, 5000);
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

        if (isInitialLoad) {
          setOrders([]);
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load your bookings right now.",
          );
        }
      } finally {
        if (active && isInitialLoad) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [reloadToken]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setReloadToken((value) => value + 1);
    }, BOOKING_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

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
      const id = Date.now();
      setToasts((current) => [
        ...current,
        {
          id,
          tone: "error",
          message:
            nextError instanceof Error
              ? nextError.message
              : "Unable to start payment recovery right now.",
        },
      ]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 5000);
    } finally {
      setRecoveringOrderId((current) => (current === orderId ? null : current));
    }
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

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1
                className="text-4xl font-bold md:text-5xl"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Your bookings
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72 md:text-base">
                Track every booking request after checkout, including vendor approval progress, charge status, and time remaining on pending approvals.
              </p>
            </div>
            <Link
              href="/vacation-planning"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Explore activities
            </Link>
          </div>
        </section>

        {returnMessage ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm ${
              returnMessage.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : returnMessage.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
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
              onClick={() => setReloadToken((value) => value + 1)}
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
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 md:text-base">
              Once you save a payment method and submit an activity request, your order and booking status will appear here.
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
            {orders.map((order) => {
              const statusNotice = getOrderStatusNotice(order);
              const isFinalizingOrder =
                order.activity_bookings.length === 0 &&
                (order.status === "awaiting_payment" ||
                  order.status === "awaiting_vendor_approval");
              const orderApprovalCountdown = formatCountdown(
                getOrderApprovalDeadlineAt(order),
                now,
              );

              return (
                <article
                  key={order.id}
                  className="rounded-[28px] border border-[#d8e5f2] bg-white p-6 shadow-[0_20px_60px_rgba(25,48,89,0.08)]"
                >
                  {statusNotice && order.status !== "awaiting_vendor_approval" ? (
                    <div
                      className={`mb-5 rounded-[22px] border px-4 py-3 text-sm font-medium ${getToastClasses(
                        statusNotice.tone,
                      )}`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em]">
                            {statusNotice.title}
                          </p>
                          <p className="mt-2">{statusNotice.message}</p>
                          {statusNotice.failureMessage ? (
                            <p className="mt-2 text-sm">
                              Reason: {statusNotice.failureMessage}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {statusNotice.receiptUrl ? (
                            <a
                              href={statusNotice.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex rounded-full border border-current/25 bg-white/70 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white"
                            >
                              View receipt
                            </a>
                          ) : null}

                          {statusNotice.canRetry ? (
                            <button
                              type="button"
                              onClick={() => void handlePaymentRecovery(order.id)}
                              disabled={recoveringOrderId === order.id}
                              className="inline-flex rounded-full border border-current/25 bg-white/70 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {recoveringOrderId === order.id
                                ? "Opening payment update..."
                                : "Update payment method"}
                            </button>
                          ) : null}

                          {statusNotice.showContactSupport ? (
                            <Link
                              href="/contact"
                              className="inline-flex rounded-full border border-current/25 bg-white/70 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white"
                            >
                              Contact support
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-5 border-b border-[#e5eef7] pb-5 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                          Order {order.id.slice(0, 8)}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${getOrderStatusClasses(
                              order.status,
                            )}`}
                          >
                            {formatStatusLabel(order.status)}
                          </span>
                          {order.status === "awaiting_vendor_approval" &&
                          orderApprovalCountdown ? (
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                              {orderApprovalCountdown}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <h2
                        className="text-3xl font-bold text-[#193059]"
                        style={{ fontFamily: "var(--font-playfair)" }}
                      >
                        {isFinalizingOrder
                          ? "Booking request being finalized"
                          : `${order.activity_bookings.length} ${
                              order.activity_bookings.length === 1
                                ? "activity booking"
                                : "activity bookings"
                            }`}
                      </h2>
                      <p className="text-sm text-slate-600">
                        Placed {orderDateFormatter.format(new Date(order.created_at))}
                      </p>
                    </div>

                    <div className="grid gap-3 rounded-[24px] bg-[#f4f8fc] p-4 text-sm text-slate-600 sm:min-w-[240px]">
                      <div className="flex items-center justify-between gap-4">
                        <span>Order total</span>
                        <span className="font-semibold text-[#193059]">
                          {formatCurrencyFromCents(order.total_cents)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Lines</span>
                        <span className="font-semibold text-[#193059]">
                          {isFinalizingOrder ? "Syncing..." : order.activity_bookings.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {isFinalizingOrder ? (
                      <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
                        We&apos;re still creating the booking items for this order after checkout.
                        Refresh is automatic, and this card will update as soon as the request is
                        fully attached to your account.
                      </div>
                    ) : (
                      order.activity_bookings.map((booking) => (
                        <BookingLine key={booking.id} booking={booking} />
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
