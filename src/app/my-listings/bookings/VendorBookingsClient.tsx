"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BookingStatus =
  | "pending_approval"
  | "confirmed"
  | "declined"
  | "completed"
  | "cancelled"
  | "expired";

type StatusFilterValue =
  | "pending"
  | "confirmed"
  | "declined"
  | "completed"
  | "all";

type VendorBookingActivityOption = {
  id: string;
  title: string;
};

type VendorBookingPreview = {
  id: string;
  activity_id: string;
  created_at: string;
  participants: number;
  total_cents: number;
  status: BookingStatus;
  customer_name: string;
  activity_title: string;
  slot_starts_at: string;
  slot_ends_at: string;
  approval_deadline_at: string | null;
};

type VendorBookingsResponse = {
  bookings: VendorBookingPreview[];
  activities: VendorBookingActivityOption[];
};

type Toast = {
  id: number;
  tone: "success" | "error";
  message: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
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
  window.location.assign("/auth/login?redirect=/my-listings/bookings");
}

function formatCurrencyFromCents(value: number) {
  return currencyFormatter.format(value / 100);
}

function formatStatusLabel(status: BookingStatus) {
  const source = status === "pending_approval" ? "pending" : status;
  return source.charAt(0).toUpperCase() + source.slice(1);
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

function formatRemainingSla(deadlineAt: string | null, status: BookingStatus, now: number) {
  if (status !== "pending_approval") {
    return "Resolved";
  }

  if (!deadlineAt) {
    return "Unavailable";
  }

  const deadlineMs = new Date(deadlineAt).getTime();
  if (Number.isNaN(deadlineMs)) {
    return "Unavailable";
  }

  const remainingMs = deadlineMs - now;
  if (remainingMs <= 0) {
    return "Expired";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(2, "0")}`;
}

function getStatusClasses(status: BookingStatus) {
  switch (status) {
    case "pending_approval":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "confirmed":
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "declined":
    case "expired":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "cancelled":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function getSlaClasses(value: string) {
  if (value === "Expired") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (value === "Resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

async function fetchVendorBookings(
  status: StatusFilterValue,
  activityId: string,
): Promise<VendorBookingsResponse> {
  const params = new URLSearchParams();
  params.set("status", status);

  if (activityId) {
    params.set("activityId", activityId);
  }

  const response = await fetch(`/api/vendor/bookings?${params.toString()}`, {
    cache: "no-store",
  });

  if (response.status === 401) {
    redirectToLogin();
    return { bookings: [], activities: [] };
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 403) {
    throw new Error("FORBIDDEN_VENDOR");
  }

  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to load booking requests right now.",
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray(payload.bookings) ||
    !Array.isArray(payload.activities)
  ) {
    throw new Error("Unexpected response while loading booking requests.");
  }

  return payload as VendorBookingsResponse;
}

export function VendorBookingsClient() {
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("pending");
  const [activityFilter, setActivityFilter] = useState("");
  const [bookings, setBookings] = useState<VendorBookingPreview[]>([]);
  const [activities, setActivities] = useState<VendorBookingActivityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [pendingActionById, setPendingActionById] = useState<
    Record<string, "approve" | "decline">
  >({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);
    setAccessDenied(false);

    void (async () => {
      try {
        const nextData = await fetchVendorBookings(statusFilter, activityFilter);
        if (!active) {
          return;
        }

        setBookings(nextData.bookings);
        setActivities(nextData.activities);
      } catch (nextError: unknown) {
        if (!active) {
          return;
        }

        setBookings([]);

        if (
          nextError instanceof Error &&
          nextError.message === "FORBIDDEN_VENDOR"
        ) {
          setAccessDenied(true);
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load booking requests right now.",
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
  }, [activityFilter, reloadToken, statusFilter]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  function pushToast(tone: Toast["tone"], message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }

  async function handleBookingAction(
    bookingId: string,
    action: "approve" | "decline",
  ) {
    setPendingActionById((current) => ({ ...current, [bookingId]: action }));

    try {
      const response = await fetch(
        `/api/vendor/activity-bookings/${bookingId}/${action}`,
        {
          method: "POST",
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : `Unable to ${action} this booking.`,
        );
      }

      pushToast(
        "success",
        action === "approve"
          ? "Booking approved."
          : "Booking declined.",
      );
      setReloadToken((value) => value + 1);
    } catch (nextError: unknown) {
      pushToast(
        "error",
        nextError instanceof Error
          ? nextError.message
          : `Unable to ${action} this booking.`,
      );
    } finally {
      setPendingActionById((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });
    }
  }

  if (accessDenied) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#E8F1FA] via-[#C5E0F5] to-[#193059] pt-24">
        <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-24 text-center">
          <div>
            <h1
              className="text-4xl font-bold text-[#193059] md:text-5xl"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Vendor Access Required
            </h1>
            <p className="mx-auto mt-4 max-w-md text-lg text-[#193059]/70">
              Booking requests are only available to signed-in vendors.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/login?redirect=/my-listings/bookings"
                className="inline-flex rounded-full bg-gradient-to-r from-[#407FC2] to-[#193059] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
              >
                Sign in
              </Link>
              <Link
                href="/my-listings"
                className="inline-flex rounded-full border border-[#193059] px-6 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#193059] hover:text-white"
              >
                Back to listings
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9fd_0%,#ffffff_42%,#eef5fb_100%)] pt-28">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 pb-16 lg:px-6">
        <section className="rounded-[32px] bg-[#193059] px-6 py-8 text-white shadow-[0_30px_80px_rgba(25,48,89,0.18)] md:px-8">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-[#8ec7ff]">
            <Link
              href="/my-listings"
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] tracking-[0.24em] text-white/78 transition-colors hover:bg-white/10"
            >
              My Listings
            </Link>
            <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] tracking-[0.24em] text-white">
              Booking Requests
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1
                className="text-4xl font-bold md:text-5xl"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Vendor bookings
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72 md:text-base">
                Review booking requests across your activities, track the 24-hour approval SLA, and confirm or decline requests without leaving your dashboard.
              </p>
            </div>
            <div className="grid gap-3 rounded-[24px] bg-white/8 p-4 text-sm text-white/80 sm:min-w-[250px]">
              <div className="flex items-center justify-between gap-4">
                <span>Showing</span>
                <span className="font-semibold text-white">{bookings.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Filter</span>
                <span className="font-semibold text-white">
                  {statusFilter === "all" ? "All statuses" : formatStatusLabel(statusFilter === "pending" ? "pending_approval" : statusFilter)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#d8e5f2] bg-white p-6 shadow-[0_20px_60px_rgba(25,48,89,0.08)]">
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <label className="grid gap-2 text-sm font-semibold text-[#193059]">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilterValue)
                }
                className="rounded-2xl border border-[#d8e5f2] bg-[#f8fbfe] px-4 py-3 text-sm font-medium text-[#193059] outline-none transition-colors focus:border-[#407FC2]"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="declined">Declined</option>
                <option value="completed">Completed</option>
                <option value="all">All statuses</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#193059]">
              Activity
              <select
                value={activityFilter}
                onChange={(event) => setActivityFilter(event.target.value)}
                className="rounded-2xl border border-[#d8e5f2] bg-[#f8fbfe] px-4 py-3 text-sm font-medium text-[#193059] outline-none transition-colors focus:border-[#407FC2]"
              >
                <option value="">All activities</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-[#d8e5f2] bg-white p-8 shadow-[0_20px_60px_rgba(25,48,89,0.08)]">
            <p className="text-sm text-slate-600">Loading booking requests...</p>
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
        ) : bookings.length === 0 ? (
          <section className="rounded-[28px] border border-[#d8e5f2] bg-white p-10 text-center shadow-[0_20px_60px_rgba(25,48,89,0.08)]">
            <h2
              className="text-3xl font-bold text-[#193059]"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              No bookings found
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 md:text-base">
              Adjust the status or activity filters to review a different set of booking requests.
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            {bookings.map((booking) => {
              const pendingAction = pendingActionById[booking.id];
              const slaValue = formatRemainingSla(
                booking.approval_deadline_at,
                booking.status,
                now,
              );

              return (
                <article
                  key={booking.id}
                  className="rounded-[28px] border border-[#d8e5f2] bg-white p-6 shadow-[0_20px_60px_rgba(25,48,89,0.08)]"
                >
                  <div className="flex flex-col gap-5 border-b border-[#e5eef7] pb-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                          Booking {booking.id.slice(0, 8)}
                        </p>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${getStatusClasses(
                            booking.status,
                          )}`}
                        >
                          {formatStatusLabel(booking.status)}
                        </span>
                      </div>

                      <div>
                        <h2
                          className="text-3xl font-bold text-[#193059]"
                          style={{ fontFamily: "var(--font-playfair)" }}
                        >
                          {booking.activity_title}
                        </h2>
                        <p className="mt-2 text-sm text-slate-600">
                          Customer: {booking.customer_name}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-[24px] bg-[#f4f8fc] p-4 text-sm text-slate-600 sm:min-w-[260px]">
                      <div className="flex items-center justify-between gap-4">
                        <span>Total</span>
                        <span className="font-semibold text-[#193059]">
                          {formatCurrencyFromCents(booking.total_cents)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Participants</span>
                        <span className="font-semibold text-[#193059]">
                          {booking.participants}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>SLA</span>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getSlaClasses(
                            slaValue,
                          )}`}
                        >
                          {slaValue}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-[22px] border border-[#d8e5f2] bg-[#f8fbfe] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                          Slot
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#193059]">
                          {formatSlotDateTime(
                            booking.slot_starts_at,
                            booking.slot_ends_at,
                          )}
                        </p>
                      </div>

                      <div className="rounded-[22px] border border-[#d8e5f2] bg-[#f8fbfe] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                          Participants
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#193059]">
                          {formatParticipants(booking.participants)}
                        </p>
                      </div>

                      <div className="rounded-[22px] border border-[#d8e5f2] bg-[#f8fbfe] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                          Requested
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#193059]">
                          {new Date(booking.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>

                    {booking.status === "pending_approval" ? (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleBookingAction(booking.id, "decline")}
                          disabled={Boolean(pendingAction)}
                          className="inline-flex min-w-[140px] items-center justify-center rounded-full border border-rose-300 px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingAction === "decline" ? "Declining..." : "Decline"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBookingAction(booking.id, "approve")}
                          disabled={Boolean(pendingAction)}
                          className="inline-flex min-w-[140px] items-center justify-center rounded-full bg-gradient-to-r from-[#407FC2] to-[#193059] px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingAction === "approve" ? "Approving..." : "Approve"}
                        </button>
                      </div>
                    ) : null}
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
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-medium shadow-[0_16px_32px_rgba(25,48,89,0.18)] ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}
