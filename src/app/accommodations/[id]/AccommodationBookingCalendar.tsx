"use client";

import { useEffect, useId, useState } from "react";
import {
  canCheckOutOn,
  getBookingCalendarRanges,
  getBookingMonth,
  isBookingCalendarResponse,
  type BookingCalendarNight,
} from "./calendar-helpers";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
});

type CalendarProps = {
  month: string;
  today: string;
  checkIn: string;
  checkOut: string;
  disabled?: boolean;
  onMonthChange: (month: string) => void;
  onSelect: (dates: { checkIn: string; checkOut: string }) => void;
};

type CalendarState =
  | { key: string; nights: BookingCalendarNight[]; error?: never }
  | { key: string; error: string; nights?: never };

export function AccommodationBookingCalendar({
  accommodationId, refreshVersion, ...props
}: CalendarProps & { accommodationId: string; refreshVersion: number }) {
  const [state, setState] = useState<CalendarState | null>(null);
  const [retry, setRetry] = useState(0);
  const rangesKey = JSON.stringify(getBookingCalendarRanges(props.month, props.checkIn, props.checkOut));
  const key = `${accommodationId}:${rangesKey}:${refreshVersion}:${retry}`;
  const current = state?.key === key ? state : null;

  useEffect(() => {
    const controller = new AbortController();
    async function loadCalendar() {
      try {
        const ranges: { from: string; to: string }[] = JSON.parse(rangesKey);
        const nights = (await Promise.all(ranges.map(async ({ from, to }) => {
          const query = new URLSearchParams({ from, to });
          const response = await fetch(`/api/accommodations/${accommodationId}/nights?${query}`, {
            cache: "no-store", signal: controller.signal,
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !isBookingCalendarResponse(payload, from, to)) {
            throw new Error("Could not load nightly prices. Please try again.");
          }
          return payload.nights;
        }))).flat();
        if (!controller.signal.aborted) setState({ key, nights });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ key, error: error instanceof Error ? error.message : "Could not load nightly prices." });
        }
      }
    }
    void loadCalendar();
    return () => controller.abort();
  }, [accommodationId, rangesKey, key]);

  return (
    <BookingCalendarMonth {...props} nights={current?.nights ?? null} error={current?.error}
      onRetry={() => setRetry((value) => value + 1)} />
  );
}

export function BookingCalendarMonth({
  month, today, checkIn, checkOut, disabled, onMonthChange, onSelect, nights, error, onRetry,
}: CalendarProps & { nights: BookingCalendarNight[] | null; error?: string; onRetry: () => void }) {
  const helpId = useId();
  const calendar = getBookingMonth(month);
  const prices = new Map(nights?.map((night) => [night.night, night.price_cents]));
  const choosingCheckout = Boolean(checkIn && !checkOut);
  const loading = !nights && !error;
  const cells = Array.from({ length: Math.ceil((calendar.leadingDays + calendar.days) / 7) * 7 }, (_, index) => {
    const day = index - calendar.leadingDays + 1;
    return day > 0 && day <= calendar.days ? `${calendar.first.slice(0, 8)}${String(day).padStart(2, "0")}` : null;
  });
  const hasAvailableNight = nights?.some((night) => night.night >= today && night.night >= calendar.first &&
    night.night <= calendar.last && night.price_cents !== null);
  const navClass = "flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FBCA1A] disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <section aria-label="Nightly prices calendar" aria-describedby={helpId} className="mt-4 min-w-0 rounded-2xl border border-white/20 p-2 sm:p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <button type="button" aria-label="Previous month" disabled={disabled || calendar.first <= today.slice(0, 7) + "-01"}
          onClick={() => onMonthChange(getBookingMonth(month, -1).first)} className={navClass}>
          <span aria-hidden="true">‹</span>
        </button>
        <h3 aria-live="polite" className="text-sm font-semibold">{calendar.label}</h3>
        <button type="button" aria-label="Next month" disabled={disabled || calendar.first >= "9999-12-01"}
          onClick={() => onMonthChange(getBookingMonth(month, 1).first)} className={navClass}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <p id={helpId} className="mt-3 px-1 text-xs leading-5 text-white/80">
        {choosingCheckout ? "Choose your check-out date. Your stay must use consecutive available nights." : "Choose a check-in date, then a check-out date."}
      </p>
      <table aria-busy={loading} className="mt-2 w-full table-fixed border-separate border-spacing-1 text-center">
        <caption className="sr-only">{calendar.label} nightly prices in USD</caption>
        <thead><tr>{weekdays.map((day) => (
          <th key={day} scope="col" className="pb-1 text-[10px] font-medium text-white/70">
            <abbr title={day} className="no-underline">{day.slice(0, 3)}</abbr>
          </th>
        ))}</tr></thead>
        <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => (
          <tr key={week}>{cells.slice(week * 7, week * 7 + 7).map((date, index) => {
            if (!date) return <td key={`blank-${index}`} />;
            const price = prices.get(date) ?? null;
            const formattedPrice = price === null ? "" : priceFormatter.format(price / 100).replace(/\.00$/, "");
            const available = date >= today && price !== null;
            const checkout = choosingCheckout && canCheckOutOn(date, checkIn, prices);
            const selectable = Boolean(nights) && date >= today &&
              (choosingCheckout && date > checkIn ? checkout : available);
            const selected = date === checkIn || date === checkOut;
            const inStay = Boolean(checkIn && checkOut && date > checkIn && date < checkOut);
            const checkoutOnly = checkout && !available;
            const dateLabel = dateFormatter.format(new Date(`${date}T00:00:00Z`));
            const priceLabel = price === null ? "Unavailable" : `${formattedPrice} per night`;
            const label = `${dateLabel}, ${loading ? "Loading price" : error ? "Price unavailable" : checkoutOnly ? "Check-out only, unavailable overnight" : priceLabel}${date === checkIn ? ", selected check-in" : date === checkOut ? ", selected check-out" : inStay ? ", selected night" : checkout ? ", choose check-out" : available && !selectable ? ", unavailable for this stay" : ""}`;
            const color = selected ? "bg-[#FBCA1A] text-[#193059] ring-2 ring-[#FBCA1A]"
              : inStay && available ? "bg-[#d7e9fc] text-[#193059]"
              : available ? "bg-white text-[#193059] enabled:hover:bg-[#fff4c4] disabled:opacity-50"
              : checkoutOnly ? "bg-slate-950/40 text-white ring-1 ring-white/60 enabled:hover:bg-white/10"
              : "bg-slate-950/40 text-white/35";
            return (
              <td key={date} className="p-0 align-top">
                <button type="button" disabled={disabled || !selectable} aria-label={label}
                  aria-pressed={selected || inStay} aria-current={date === today ? "date" : undefined}
                  onClick={() => onSelect(choosingCheckout && date > checkIn
                    ? { checkIn, checkOut: date } : { checkIn: date, checkOut: "" })}
                  className={`flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FBCA1A] disabled:cursor-not-allowed ${color}`}>
                  <span className="text-sm font-semibold">{Number(date.slice(8))}</span>
                  <span aria-hidden="true" className="w-full text-[10px] leading-3 tabular-nums [overflow-wrap:anywhere] sm:text-[11px]">
                    {loading || error ? "…" : date === checkOut || checkoutOnly ? "Out" : price === null || date < today ? "—" : formattedPrice}
                  </span>
                </button>
              </td>
            );
          })}</tr>
        ))}</tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 px-1 text-[11px] text-white/80">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm bg-white" />Price per night (USD)</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm bg-slate-950/40" />Unavailable</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm bg-[#FBCA1A]" />Selected dates</span>
      </div>
      <div aria-live="polite" className="mt-2 px-1 text-xs leading-5 text-white/80">
        {loading && <p>Loading nightly prices…</p>}
        {error && <p role="alert">{error} <button type="button" disabled={disabled} onClick={onRetry} className="font-semibold text-white underline underline-offset-2">Retry calendar</button></p>}
        {nights && !hasAvailableNight && <p>No available nights this month. Try another month.</p>}
        {choosingCheckout && <p>You can check out on the first unavailable date after your stay.</p>}
      </div>
      {(checkIn || checkOut) && <button type="button" disabled={disabled} onClick={() => onSelect({ checkIn: "", checkOut: "" })}
        className="mt-2 px-1 text-xs font-semibold text-white underline underline-offset-4 disabled:opacity-50">Clear dates</button>}
    </section>
  );
}
