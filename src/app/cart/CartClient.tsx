"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrencyFromCents, formatSlotDateTime } from "@/lib/utils/formatting";
import type { CartLineWithPreview } from "@/lib/cart/types";
import { redirectToLogin } from "@/app/_shared/client-auth";
import { getSemanticNoticeClasses } from "@/app/_shared/client-tone";
import {
  type CartBannerTone,
  formatParticipantsLabel,
  formatSpotLabel,
  getCartLineAvailabilityState,
  getCartSummary,
  getCheckoutCallToActionState,
  getDraftLineTotalCents,
  getLineParticipants,
  getLineTotalCents,
} from "./cart-ui";

type StatusMessage = {
  tone: CartBannerTone;
  text: string;
};

type CartClientProps = {
  initialMessage?: StatusMessage | null;
};

type BusyAction =
  | { lineId: string; action: "update" | "remove" }
  | null;

const CART_REFRESH_ERROR_MESSAGES = new Set([
  "This slot is no longer available",
  "Not enough spots left for this time slot",
  "Activity is not available for booking",
]);

function shouldRefreshCartAfterError(message: string) {
  return CART_REFRESH_ERROR_MESSAGES.has(message);
}

function getDraftParticipantLimit(line: CartLineWithPreview) {
  return Math.max(1, getLineParticipants(line), line.remaining_capacity);
}

function clampDraftParticipants(
  value: number,
  fallback: number,
  max: number,
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const next = Math.trunc(value);
  return Math.max(1, Math.min(max, next));
}

function getMessageClasses(tone: CartBannerTone) {
  return tone === "error"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : getSemanticNoticeClasses(tone);
}

function getAvailabilityClasses(
  tone: ReturnType<typeof getCartLineAvailabilityState>["tone"],
) {
  return getSemanticNoticeClasses(tone);
}

async function fetchCartLines(): Promise<CartLineWithPreview[]> {
  const response = await fetch("/api/cart/lines", {
    cache: "no-store",
  });

  if (response.status === 401) {
    redirectToLogin("/cart");
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

type ParticipantStepperProps = {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function ParticipantStepper({
  value,
  max,
  disabled = false,
  onChange,
}: ParticipantStepperProps) {
  const canDecrease = !disabled && value > 1;
  const canIncrease = !disabled && value < max;
  const dividerClass = disabled ? "border-slate-200" : "border-[#c8d9ea]";

  return (
    <div
      className={`flex w-[176px] shrink-0 items-center overflow-hidden rounded-2xl border ${
        disabled
          ? "border-slate-200 bg-slate-100 text-slate-400"
          : "border-[#c8d9ea] bg-white text-[#193059]"
      }`}
    >
      <button
        type="button"
        aria-label="Decrease participants"
        disabled={!canDecrease}
        onClick={() => onChange(value - 1)}
        className="flex h-12 w-12 items-center justify-center rounded-l-2xl text-lg font-semibold transition-colors hover:bg-[#eef5fb] disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
      >
        -
      </button>
      <input
        type="number"
        min={1}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            clampDraftParticipants(
              event.currentTarget.valueAsNumber,
              value,
              max,
            ),
          )
        }
        className={`h-12 w-20 border-x bg-transparent px-2 text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${dividerClass}`}
      />
      <button
        type="button"
        aria-label="Increase participants"
        disabled={!canIncrease}
        onClick={() => onChange(value + 1)}
        className="flex h-12 w-12 items-center justify-center rounded-r-2xl text-lg font-semibold transition-colors hover:bg-[#eef5fb] disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
      >
        +
      </button>
    </div>
  );
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
  const [confirmingRemovalLineId, setConfirmingRemovalLineId] = useState<string | null>(
    null,
  );

  function applyCartLines(nextLines: CartLineWithPreview[]) {
    setLines(nextLines);
    setParticipantDrafts(
      Object.fromEntries(
        nextLines.map((line) => [line.id, getLineParticipants(line)]),
      ) as Record<string, number>,
    );
    setConfirmingRemovalLineId((current) =>
      current && nextLines.some((line) => line.id === current) ? current : null,
    );
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      if (active) {
        setLoading(true);
        setError(null);
      }

      try {
        const nextLines = await fetchCartLines();
        if (!active) {
          return;
        }

        applyCartLines(nextLines);
      } catch (nextError: unknown) {
        if (!active) {
          return;
        }

        setLines([]);
        setParticipantDrafts({});
        setConfirmingRemovalLineId(null);
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

  const summary = getCartSummary(lines);
  const dirtyLineCount = lines.reduce((count, line) => {
    const currentParticipants = getLineParticipants(line);
    const draftParticipants = participantDrafts[line.id] ?? currentParticipants;
    return count + (draftParticipants !== currentParticipants ? 1 : 0);
  }, 0);
  const hasPendingMutation = busyAction !== null;
  const checkoutState = getCheckoutCallToActionState({
    lines,
    dirtyLineCount,
    hasPendingMutation,
  });

  async function handleUpdateParticipants(line: CartLineWithPreview) {
    const currentParticipants = getLineParticipants(line);
    const maxDraftParticipants = getDraftParticipantLimit(line);
    const participants = clampDraftParticipants(
      participantDrafts[line.id] ?? currentParticipants,
      currentParticipants,
      maxDraftParticipants,
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
        redirectToLogin("/cart");
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
        text: `Saved ${formatParticipantsLabel(participants)} for ${
          line.activity_title || "this activity"
        }. Your payment method can be saved next, and no charge is created unless the vendor confirms availability.`,
      });
    } catch (nextError: unknown) {
      const nextMessage =
        nextError instanceof Error
          ? nextError.message
          : "Unable to update this cart item.";

      if (shouldRefreshCartAfterError(nextMessage)) {
        setReloadToken((value) => value + 1);
        setMessage({
          tone: "warning",
          text: `Availability changed while you were editing this request. ${nextMessage} We refreshed your cart so you can review the latest availability.`,
        });
      } else {
        setMessage({
          tone: "error",
          text: nextMessage,
        });
      }
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
        redirectToLogin("/cart");
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
      setConfirmingRemovalLineId(null);
      setMessage({
        tone: "success",
        text: `${line.activity_title || "This activity"} was removed from your cart. You can keep browsing or continue with the remaining activity requests.`,
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
        redirectToLogin("/cart");
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
      const nextMessage =
        nextError instanceof Error
          ? nextError.message
          : "Unable to start checkout right now.";

      if (shouldRefreshCartAfterError(nextMessage)) {
        setReloadToken((value) => value + 1);
        setMessage({
          tone: "warning",
          text: `Your cart changed before checkout could begin. ${nextMessage} We refreshed the latest availability so you can review it before saving a payment method.`,
        });
      } else {
        setMessage({
          tone: "error",
          text: `${nextMessage} Stripe only saves a payment method at this step, so no charge was created.`,
        });
      }
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
            <span className="rounded-full bg-white/12 px-5 py-2 text-xs tracking-[0.24em] text-white">
              Cart
            </span>
            <Link
              href="/my-trip/bookings"
              className="rounded-full border border-white/15 px-5 py-2 text-xs tracking-[0.24em] text-white/78 transition-colors hover:bg-white/10"
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
                Review each activity request, update participants, and save a payment method for
                vendor review. Stripe does not charge the guest during checkout. A charge only
                happens later for bookings the vendor confirms.
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
            className={`rounded-2xl border px-4 py-3 text-sm ${getMessageClasses(
              message.tone,
            )}`}
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
              No activity requests in your cart yet
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Add an activity departure to start your trip. When you are ready, checkout will save
              a payment method first, then vendors review live availability. You are only charged
              later if a vendor confirms the booking.
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
                const currentParticipants = getLineParticipants(line);
                const participants = participantDrafts[line.id] ?? currentParticipants;
                const isBusy = busyAction?.lineId === line.id;
                const isUpdating =
                  busyAction?.lineId === line.id && busyAction.action === "update";
                const isRemoving =
                  busyAction?.lineId === line.id && busyAction.action === "remove";
                const hasParticipantChange = participants !== currentParticipants;
                const availabilityState = getCartLineAvailabilityState(line);
                const maxDraftParticipants = getDraftParticipantLimit(line);
                const currentLineTotalCents = getLineTotalCents(line.line_total_cents);
                const draftLineTotalCents = getDraftLineTotalCents(line, participants);
                const canSaveParticipants =
                  availabilityState.canEditParticipants &&
                  hasParticipantChange &&
                  participants <= line.remaining_capacity;
                const isConfirmingRemove = confirmingRemovalLineId === line.id;

                return (
                  <article
                    key={line.id}
                    className="rounded-[28px] border border-[#d8e5f2] bg-white p-6 shadow-[0_20px_60px_rgba(25,48,89,0.08)]"
                  >
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 flex-1 gap-4">
                        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#dbe8f6_0%,#8ec7ff_48%,#193059_100%)] shadow-[0_18px_40px_rgba(25,48,89,0.12)]">
                          {line.activity_image_url ? (
                            <img
                              src={line.activity_image_url}
                              alt={line.activity_title || "Activity cover"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.5),transparent_55%)] p-4 text-left">
                              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
                                Activity
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 space-y-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                              Activity booking
                            </p>
                            <h2
                              className="mt-2 text-2xl font-bold text-[#193059]"
                              style={{ fontFamily: "var(--font-playfair)" }}
                            >
                              {line.activity_title || "Unavailable activity"}
                            </h2>
                            <p className="mt-2 text-sm text-slate-600">
                              {formatSlotDateTime(line.slot_starts_at, line.slot_ends_at)}
                            </p>
                          </div>

                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#dbe7f2] bg-[#f4f8fc] px-5 py-4 text-left md:w-[280px] md:shrink-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {hasParticipantChange ? "Draft total" : "Request total"}
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-[#193059]">
                          {formatCurrencyFromCents(
                            hasParticipantChange ? draftLineTotalCents : currentLineTotalCents,
                          )}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {hasParticipantChange
                            ? `${formatParticipantsLabel(participants)} pending save`
                            : "Matches the participant count currently saved in your cart."}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${getAvailabilityClasses(
                        availabilityState.tone,
                      )}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                        {availabilityState.title}
                      </p>
                      <p className="mt-2">{availabilityState.detail}</p>
                    </div>

                    <div className="mt-6 flex flex-col gap-4 border-t border-[#e5eef7] pt-5 xl:flex-row xl:items-end xl:justify-between">
                      <div className="space-y-3">
                        <div>
                          <span className="mb-2 block text-sm font-medium text-[#193059]">
                            Participants
                          </span>
                          <ParticipantStepper
                            value={participants}
                            max={maxDraftParticipants}
                            disabled={
                              isBusy || checkoutLoading || !availabilityState.canEditParticipants
                            }
                            onChange={(nextParticipants) => {
                              setMessage(null);
                              setParticipantDrafts((current) => ({
                                ...current,
                                [line.id]: clampDraftParticipants(
                                  nextParticipants,
                                  currentParticipants,
                                  maxDraftParticipants,
                                ),
                              }));
                            }}
                          />
                        </div>
                        <p className="text-xs leading-5 text-slate-500">
                          {availabilityState.canEditParticipants
                            ? hasParticipantChange
                              ? `Draft total: ${formatCurrencyFromCents(
                                  draftLineTotalCents,
                                )}. Save this change before you continue to checkout.`
                              : `You can request up to ${formatSpotLabel(
                                  maxDraftParticipants,
                                )} from this cart view.`
                            : "This line cannot be edited anymore. Remove it to continue."}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 xl:items-end">
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => void handleUpdateParticipants(line)}
                            disabled={!canSaveParticipants || isBusy || checkoutLoading}
                            className="rounded-full border border-[#193059] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#193059] hover:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                          >
                            {isUpdating ? "Saving..." : "Save participants"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMessage(null);
                              setParticipantDrafts((current) => ({
                                ...current,
                                [line.id]: currentParticipants,
                              }));
                            }}
                            disabled={!hasParticipantChange || isBusy || checkoutLoading}
                            className="rounded-full border border-[#c8d9ea] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#f4f8fc] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                          >
                            Reset
                          </button>
                          {!isConfirmingRemove ? (
                            <button
                              type="button"
                              onClick={() => setConfirmingRemovalLineId(line.id)}
                              disabled={isBusy || checkoutLoading}
                              className="rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>

                        {isConfirmingRemove ? (
                          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                            <p>Remove this activity request from your cart?</p>
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => setConfirmingRemovalLineId(null)}
                                disabled={isRemoving}
                                className="rounded-full border border-rose-200 bg-white px-4 py-2 font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:text-slate-400"
                              >
                                Keep request
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemoveLine(line)}
                                disabled={isRemoving}
                                className="rounded-full bg-rose-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                              >
                                {isRemoving ? "Removing..." : "Remove activity"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="rounded-[28px] border border-[#d8e5f2] bg-white p-6 shadow-[0_20px_60px_rgba(25,48,89,0.08)] lg:sticky lg:top-28">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#407FC2]">
                Order summary
              </p>
              <h2
                className="mt-3 text-2xl font-bold text-[#193059]"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Before secure checkout
              </h2>

              <div className="mt-6 space-y-4 rounded-2xl bg-[#f4f8fc] p-4">
                <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>Activities</span>
                  <span>{summary.activityCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>Participants</span>
                  <span>{summary.participantCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#193059]">
                    {formatCurrencyFromCents(summary.subtotalCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-[#d8e5f2] pt-4 text-base font-semibold text-[#193059]">
                  <span>Total</span>
                  <span>{formatCurrencyFromCents(summary.totalCents)}</span>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-[#d8e5f2] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  How checkout works
                </p>
                <ol className="mt-4 space-y-3 text-sm text-slate-600">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#193059] text-xs font-semibold text-white">
                      1
                    </span>
                    <span>Save a payment method securely in Stripe.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#193059] text-xs font-semibold text-white">
                      2
                    </span>
                    <span>Vendors review live availability for each activity request.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#193059] text-xs font-semibold text-white">
                      3
                    </span>
                    <span>Only confirmed bookings are charged later.</span>
                  </li>
                </ol>
              </div>

              {checkoutState.blockingMessage ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {checkoutState.blockingMessage}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={checkoutLoading || checkoutState.disabled}
                className="mt-6 w-full rounded-full bg-gradient-to-r from-[#407FC2] to-[#193059] px-6 py-4 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400"
              >
                {checkoutLoading ? "Opening secure checkout..." : checkoutState.label}
              </button>

              <p className="mt-4 text-sm leading-6 text-slate-600">{checkoutState.supportText}</p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
