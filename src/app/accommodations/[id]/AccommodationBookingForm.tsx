"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatCurrencyFromCents } from "@/lib/utils/formatting";
import type { AccommodationStayQuote } from "@/lib/accommodation-calendar/service";
import { AccommodationBookingCalendar } from "./AccommodationBookingCalendar";
import {
  buildAccommodationLoginRedirect,
  getStaySelectionError,
  isStayQuoteForSelection,
  nextStayDate,
  type StaySelection,
} from "./booking-helpers";

type Availability =
  | { key: string; status: "ready"; quote: AccommodationStayQuote }
  | { key: string; status: "error"; message: string };

type Props = {
  accommodationId: string;
  maxGuests: number | null;
  initialSelection?: StaySelection;
};

export function AccommodationBookingForm({
  accommodationId,
  maxGuests,
  initialSelection,
}: Props) {
  const [selection, setSelection] = useState<StaySelection>(
    initialSelection ?? { checkIn: "", checkOut: "", guests: "1" },
  );
  const today = new Date().toISOString().slice(0, 10);
  const [calendarMonth, setCalendarMonth] = useState(() => (
    initialSelection?.checkIn && nextStayDate(initialSelection.checkIn) && initialSelection.checkIn >= today
      ? initialSelection.checkIn : today
  ).slice(0, 7) + "-01");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [retry, setRetry] = useState(0);
  const [adding, setAdding] = useState(false);
  const submitting = useRef(false);
  const [cartMessage, setCartMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const selectionError = getStaySelectionError(selection, maxGuests);
  const params = new URLSearchParams({
    check_in: selection.checkIn,
    check_out: selection.checkOut,
    guests: String(Number(selection.guests)),
  }).toString();
  const key = `${accommodationId}?${params}`;
  const currentAvailability = availability?.key === key ? availability : null;
  const quote = currentAvailability?.status === "ready" ? currentAvailability.quote : null;
  const checking = !selectionError && !currentAvailability;

  useEffect(() => {
    if (selectionError) return;
    const controller = new AbortController();

    async function checkAvailability() {
      try {
        const response = await fetch(`/api/accommodations/${accommodationId}/availability?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Could not check availability. Please try again.");
        }
        const query = new URLSearchParams(params);
        if (!isStayQuoteForSelection(payload, { checkIn: query.get("check_in")!, checkOut: query.get("check_out")! })) {
          throw new Error("Could not load the stay price. Please try again.");
        }
        if (!controller.signal.aborted) {
          setAvailability({ key, status: "ready", quote: payload });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAvailability({
            key,
            status: "error",
            message: error instanceof Error ? error.message : "Could not check availability. Please try again.",
          });
        }
      }
    }

    void checkAvailability();
    return () => controller.abort();
  }, [accommodationId, params, key, selectionError, retry]);

  function changeSelection(update: Partial<StaySelection>) {
    setSelection((current) => ({ ...current, ...update }));
    setCartMessage(null);
  }

  function refreshAvailability() {
    setAvailability(null);
    setRetry((current) => current + 1);
  }

  async function addToCart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || selectionError || !quote?.available) return;
    submitting.current = true;
    setAdding(true);
    setCartMessage(null);

    try {
      const response = await fetch("/api/cart/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accommodation_id: accommodationId,
          check_in: selection.checkIn,
          check_out: selection.checkOut,
          guests: Number(selection.guests),
          expected_total_cents: quote.total_cents,
        }),
      });
      if (response.status === 401) {
        window.location.assign(buildAccommodationLoginRedirect(accommodationId, selection));
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not add this stay to your cart. Please try again.");
      }
      setCartMessage({
        type: "success",
        text: `Your ${quote.nights}-night stay for ${selection.guests} ${Number(selection.guests) === 1 ? "guest is" : "guests is"} in your cart. Complete checkout to send your booking request to the host.`,
      });
    } catch (error) {
      setCartMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not add this stay to your cart. Please try again.",
      });
      refreshAvailability();
    } finally {
      submitting.current = false;
      setAdding(false);
    }
  }

  const inputClass = "mt-1.5 w-full rounded-xl border border-white/25 bg-white px-3 py-2.5 text-sm text-[#193059] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FBCA1A] disabled:opacity-60";

  return (
    <form onSubmit={addToCart} className="mt-5 border-t border-white/20 pt-4" aria-label="Book your stay">
      <h2 className="text-lg font-semibold">Book your stay</h2>
      <p className="mt-1 text-xs leading-5 text-white/80">Choose dates to check the host’s available nights and prices. Nightly rates may vary.</p>
      <AccommodationBookingCalendar accommodationId={accommodationId} month={calendarMonth} today={today}
        checkIn={selection.checkIn} checkOut={selection.checkOut} disabled={adding} refreshVersion={retry}
        onMonthChange={setCalendarMonth} onSelect={changeSelection} />
      <fieldset disabled={adding} className="mt-3 grid min-w-0 gap-3 sm:grid-cols-3">
        <legend className="sr-only">Stay dates and guests</legend>
        <label className="min-w-0 text-sm font-medium">
          Check-in
          <input type="date" name="check_in" required min={today} value={selection.checkIn}
            onChange={(event) => {
              const checkIn = event.target.value;
              changeSelection({ checkIn, checkOut: "" });
              if (nextStayDate(checkIn) && checkIn >= today) setCalendarMonth(checkIn.slice(0, 7) + "-01");
            }} className={inputClass} />
        </label>
        <label className="min-w-0 text-sm font-medium">
          Check-out
          <input type="date" name="check_out" required min={nextStayDate(selection.checkIn) ?? nextStayDate(today)} value={selection.checkOut}
            onChange={(event) => changeSelection({ checkOut: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0 text-sm font-medium">
          Guests{maxGuests !== null ? ` (up to ${maxGuests})` : ""}
          <input type="number" name="guests" required min={1} max={maxGuests ?? undefined} step={1} value={selection.guests}
            onChange={(event) => changeSelection({ guests: event.target.value })} className={inputClass} />
        </label>
      </fieldset>

      <div aria-live="polite" aria-atomic="true" className="mt-3 text-sm">
        {selectionError && <p className="text-white/80">{selectionError}</p>}
        {checking && <p className="text-white/80">Checking availability and price…</p>}
        {!selectionError && currentAvailability?.status === "error" && (
          <p className="text-rose-100">{currentAvailability.message}</p>
        )}
        {!selectionError && quote && (
          <>
            <p className={quote.available ? "text-emerald-200" : "text-amber-200"}>
              {quote.available ? "Available to request. Your host will confirm your booking." : "These dates are unavailable. Choose different dates."}
            </p>
            {quote.available && (
              <dl className="mt-3 rounded-xl bg-white/10 p-3">
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {quote.nightly_prices.map((night) => (
                    <div key={night.night} className="flex flex-wrap justify-between gap-2 text-white/80">
                      <dt><time dateTime={night.night}>{night.night}</time></dt>
                      <dd>{formatCurrencyFromCents(night.price_cents)}</dd>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between gap-2 border-t border-white/20 pt-2 font-semibold">
                  <dt>{quote.nights}-night stay total (USD)</dt><dd>{formatCurrencyFromCents(quote.total_cents)}</dd>
                </div>
              </dl>
            )}
          </>
        )}
      </div>

      {!selectionError && currentAvailability && (
        <button type="button" onClick={refreshAvailability} disabled={adding}
          className="mt-2 text-sm text-white/80 underline underline-offset-4 hover:text-white disabled:opacity-60">
          Check availability again
        </button>
      )}
      <button type="submit" disabled={adding || Boolean(selectionError) || !quote?.available}
        className="mt-4 w-full rounded-full bg-[#FBCA1A] px-5 py-3 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#f0bf10] disabled:cursor-not-allowed disabled:opacity-50">
        {adding ? "Adding to cart…" : "Add stay to cart"}
      </button>
      <p className="mt-3 text-xs leading-5 text-white/80">
        At checkout, securely save your card with Stripe. You will only be charged after the host confirms availability. Adding a stay to your cart does not reserve it.
      </p>
      {cartMessage && (
        <div role={cartMessage.type === "error" ? "alert" : "status"}
          className={`mt-3 rounded-xl border p-3 text-sm ${cartMessage.type === "success" ? "border-emerald-300/40 bg-emerald-950/30 text-emerald-100" : "border-rose-300/40 bg-rose-950/30 text-rose-100"}`}>
          <p>{cartMessage.text}</p>
          {cartMessage.type === "success" && (
            <Link href="/cart" className="mt-2 inline-block font-semibold text-white underline underline-offset-4">Review cart and request booking</Link>
          )}
        </div>
      )}
    </form>
  );
}
