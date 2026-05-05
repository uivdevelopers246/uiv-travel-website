"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CartLineWithPreview } from "@/lib/cart/types";

type StatusMessage = {
  tone: "success" | "error";
  text: string;
};

type CartClientProps = {
  initialMessage?: StatusMessage | null;
};

type BusyAction =
  | { lineId: string; action: "update" | "remove" }
  | null;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function redirectToLogin() {
  window.location.assign("/auth/login?redirect=/cart");
}

function formatCurrencyFromCents(value: number) {
  return currencyFormatter.format(value / 100);
}

function formatParticipantsLabel(count: number) {
  return `${count} ${count === 1 ? "participant" : "participants"}`;
}

function getParticipantCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.trunc(value));
}

function getLineTotalCents(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function formatSlotDateTime(startsAt: string, endsAt: string) {
  if (!startsAt || !endsAt) {
    return "Date and time unavailable";
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${dateFormatter.format(start)} - ${timeFormatter.format(start)} to ${timeFormatter.format(end)}`;
}

function normalizeParticipants(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const next = Math.trunc(value);
  return Math.max(1, next);
}

async function fetchCartLines(): Promise<CartLineWithPreview[]> {
  const response = await fetch("/api/cart/lines", {
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
        : "Unable to load your cart right now.",
    );
  }

  if (!Array.isArray(payload)) {
    throw new Error("Unexpected response while loading your cart.");
  }

  return payload as CartLineWithPreview[];
}

export function CartClient({ initialMessage = null }: CartClientProps) {
  const [lines, setLines] = useState<CartLineWithPreview[]>([]);
  const [participantDrafts, setParticipantDrafts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<StatusMessage | null>(initialMessage);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextLines = await fetchCartLines();
        if (!active) {
          return;
        }

        setLines(nextLines);
        setParticipantDrafts(
          Object.fromEntries(
            nextLines.map((line) => [line.id, getParticipantCount(line.participants)]),
          ) as Record<string, number>,
        );
      } catch (nextError: unknown) {
        if (!active) {
          return;
        }

        setLines([]);
        setParticipantDrafts({});
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load your cart right now.",
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
  }, [reloadToken]);

  const subtotalCents = lines.reduce(
    (sum, line) => sum + getLineTotalCents(line.line_total_cents),
    0,
  );
  const totalCents = subtotalCents;

  async function handleUpdateParticipants(line: CartLineWithPreview) {
    const currentParticipants = getParticipantCount(line.participants);
    const participants = normalizeParticipants(
      participantDrafts[line.id] ?? currentParticipants,
      currentParticipants,
    );

    setBusyAction({ lineId: line.id, action: "update" });
    setMessage(null);

    try {
      const response = await fetch(`/api/cart/lines/${line.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ participants }),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to update this cart item.",
        );
      }

      if (!payload || typeof payload !== "object" || !("participants" in payload)) {
        throw new Error("Unexpected response while updating your cart.");
      }

      setLines((current) =>
        current.map((currentLine) =>
          currentLine.id === line.id
            ? {
                ...currentLine,
                ...payload,
              }
            : currentLine,
        ),
      );
      setParticipantDrafts((current) => ({
        ...current,
        [line.id]: participants,
      }));
      setMessage({
        tone: "success",
        text: `Updated ${line.activity_title || "activity"} to ${formatParticipantsLabel(participants)}.`,
      });
    } catch (nextError: unknown) {
      setMessage({
        tone: "error",
        text:
          nextError instanceof Error
            ? nextError.message
            : "Unable to update this cart item.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveLine(line: CartLineWithPreview) {
    setBusyAction({ lineId: line.id, action: "remove" });
    setMessage(null);

    try {
      const response = await fetch(`/api/cart/lines/${line.id}`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to remove this cart item.",
        );
      }

      setLines((current) => current.filter((currentLine) => currentLine.id !== line.id));
      setParticipantDrafts((current) => {
        const next = { ...current };
        delete next[line.id];
        return next;
      });
      setMessage({
        tone: "success",
        text: `${line.activity_title || "Activity"} removed from your cart.`,
      });
    } catch (nextError: unknown) {
      setMessage({
        tone: "error",
        text:
          nextError instanceof Error
            ? nextError.message
            : "Unable to remove this cart item.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCheckout() {
    setCheckoutLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to start checkout right now.",
        );
      }

      if (!payload || typeof payload.url !== "string" || payload.url.length === 0) {
        throw new Error("Checkout session did not include a redirect URL.");
      }

      window.location.assign(payload.url);
    } catch (nextError: unknown) {
      setMessage({
        tone: "error",
        text:
          nextError instanceof Error
            ? nextError.message
            : "Unable to start checkout right now.",
      });
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9fd_0%,#ffffff_42%,#eef5fb_100%)] pt-28">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 pb-16 lg:px-6">
        <section className="rounded-[32px] bg-[#193059] px-6 py-8 text-white shadow-[0_30px_80px_rgba(25,48,89,0.18)] md:px-8">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-[#8ec7ff]">
            <span>My Trip</span>
            <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] tracking-[0.24em] text-white">
              Cart
            </span>
            <Link
              href="/my-trip/bookings"
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] tracking-[0.24em] text-white/78 transition-colors hover:bg-white/10"
            >
              Bookings
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1
                className="text-4xl font-bold md:text-5xl"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Your cart
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72 md:text-base">
                Review your activities, adjust participant counts, and save a payment method for vendor approval. You will not be charged until the vendor confirms availability.
              </p>
            </div>
            <Link
              href="/vacation-planning"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Continue browsing
            </Link>
          </div>
        </section>

        {message && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <section className="rounded-[28px] border border-[#d8e5f2] bg-white p-8 shadow-[0_20px_60px_rgba(25,48,89,0.08)]">
            <p className="text-sm text-slate-600">Loading your cart...</p>
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
        ) : lines.length === 0 ? (
          <section className="rounded-[28px] border border-[#d8e5f2] bg-white p-10 text-center shadow-[0_20px_60px_rgba(25,48,89,0.08)]">
            <h2
              className="text-3xl font-bold text-[#193059]"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Your cart is empty
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 md:text-base">
              Add an activity time slot to start building your trip. You can come back here anytime to adjust participants before checkout.
            </p>
            <Link
              href="/vacation-planning"
              className="mt-6 inline-flex rounded-full bg-gradient-to-r from-[#407FC2] to-[#193059] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
            >
              Explore activities
            </Link>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)] lg:items-start">
            <section className="space-y-4">
              {lines.map((line) => {
                const currentParticipants = getParticipantCount(line.participants);
                const participants = participantDrafts[line.id] ?? currentParticipants;
                const isBusy = busyAction?.lineId === line.id;
                const isUpdating =
                  busyAction?.lineId === line.id && busyAction.action === "update";
                const isRemoving =
                  busyAction?.lineId === line.id && busyAction.action === "remove";
                const hasParticipantChange = participants !== currentParticipants;

                return (
                  <article
                    key={line.id}
                    className="rounded-[28px] border border-[#d8e5f2] bg-white p-6 shadow-[0_20px_60px_rgba(25,48,89,0.08)]"
                  >
                    <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                          Activity
                        </p>
                        <h2
                          className="text-2xl font-bold text-[#193059]"
                          style={{ fontFamily: "var(--font-playfair)" }}
                        >
                          {line.activity_title || "Untitled activity"}
                        </h2>
                        <p className="text-sm text-slate-600">
                          {formatSlotDateTime(line.slot_starts_at, line.slot_ends_at)}
                        </p>
                        <p className="text-sm text-slate-600">
                          Current booking: {formatParticipantsLabel(currentParticipants)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#f4f8fc] px-4 py-3 text-left md:min-w-[180px]">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                          Line Total
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-[#193059]">
                          {formatCurrencyFromCents(getLineTotalCents(line.line_total_cents))}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-4 border-t border-[#e5eef7] pt-5 sm:flex-row sm:items-end sm:justify-between">
                      <label className="block sm:min-w-[180px]">
                        <span className="mb-2 block text-sm font-medium text-[#193059]">
                          Participants
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={participants}
                          disabled={isBusy || checkoutLoading}
                          onChange={(event) => {
                            setMessage(null);
                            setParticipantDrafts((current) => ({
                              ...current,
                              [line.id]: normalizeParticipants(
                                event.currentTarget.valueAsNumber,
                                currentParticipants,
                              ),
                            }));
                          }}
                          className="w-full rounded-xl border border-[#c8d9ea] bg-white px-4 py-3 text-[#193059] outline-none transition-colors focus:border-[#407FC2] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </label>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => void handleUpdateParticipants(line)}
                          disabled={isBusy || checkoutLoading || !hasParticipantChange}
                          className="rounded-full border border-[#193059] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#193059] hover:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                        >
                          {isUpdating ? "Saving..." : "Update participants"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoveLine(line)}
                          disabled={isBusy || checkoutLoading}
                          className="rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                        >
                          {isRemoving ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="rounded-[28px] border border-[#d8e5f2] bg-white p-6 shadow-[0_20px_60px_rgba(25,48,89,0.08)] lg:sticky lg:top-28">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                Order Summary
              </p>
              <h2
                className="mt-3 text-2xl font-bold text-[#193059]"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Ready for checkout
              </h2>
              <div className="mt-6 space-y-4 rounded-2xl bg-[#f4f8fc] p-4">
                <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>Items</span>
                  <span>{lines.length}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#193059]">
                    {formatCurrencyFromCents(subtotalCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-[#d8e5f2] pt-4 text-base font-semibold text-[#193059]">
                  <span>Total</span>
                  <span>{formatCurrencyFromCents(totalCents)}</span>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">
                Stripe will securely save your payment method now. Your booking request is submitted after setup completes, and the card is charged only if the vendor approves.
              </p>

              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={checkoutLoading || busyAction !== null}
                className="mt-6 w-full rounded-full bg-gradient-to-r from-[#407FC2] to-[#193059] px-6 py-4 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400"
              >
                {checkoutLoading ? "Redirecting to Stripe..." : "Save payment method"}
              </button>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
