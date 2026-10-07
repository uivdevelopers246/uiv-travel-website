"use client";

import { useEffect, useState } from "react";
import {
  validateCalendarRange,
  type AccommodationCalendarNight,
} from "@/lib/accommodation-calendar/service";
import { formatCurrencyFromCents, formatStayDateRange } from "@/lib/utils/formatting";
import { calendarUpdateFromForm } from "./calendar-ui";

const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#407FC2]";
const nightFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

export function AccommodationCalendarManager({
  accommodationId, initialFirstNight, initialLastNight,
}: {
  accommodationId: string;
  initialFirstNight: string;
  initialLastNight: string;
}) {
  const [firstNight, setFirstNight] = useState(initialFirstNight);
  const [lastNight, setLastNight] = useState(initialLastNight);
  const [available, setAvailable] = useState(true);
  const [price, setPrice] = useState("");
  const [nights, setNights] = useState<AccommodationCalendarNight[]>([]);
  const [loadedRange, setLoadedRange] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const rangeKey = `${firstNight}:${lastNight}`;
  let rangeError: string | null = null;
  try {
    validateCalendarRange(firstNight, lastNight);
  } catch (error) {
    rangeError = error instanceof Error ? error.message : "Choose valid first and last nights.";
  }
  const current = loadedRange === rangeKey && !loading && !loadError && !rangeError;
  const heldCount = current ? nights.filter((night) => night.is_held).length : 0;
  const pastRange = firstNight < initialFirstNight;

  useEffect(() => {
    if (rangeError) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const query = new URLSearchParams({ from: firstNight, to: lastNight });
        const response = await fetch(`/api/accommodations/${accommodationId}/calendar?${query}`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.nights)) {
          throw new Error(data?.error ?? "Unable to load the calendar. Please try again.");
        }
        if (active) {
          setNights(data.nights);
          setLoadedRange(rangeKey);
        }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Unable to load the calendar.");
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [accommodationId, firstNight, lastNight, rangeKey, rangeError, reloadToken]);

  async function saveRange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || saving || heldCount > 0) return;
    setMessage(null);
    try {
      const update = calendarUpdateFromForm(firstNight, lastNight, available, price);
      setSaving(true);
      const response = await fetch(`/api/accommodations/${accommodationId}/calendar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to update these nights. Please try again.");
      setMessage({ error: false, text: `${nights.length} ${nights.length === 1 ? "night" : "nights"} updated: ${formatStayDateRange(firstNight, lastNight)} (inclusive).` });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Unable to update these nights." });
    } finally {
      setSaving(false);
      setLoading(true);
      setReloadToken((value) => value + 1);
    }
  }

  return (
    <section aria-label="Accommodation availability and nightly prices" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold">Set your available nights</h2>
      <p id="calendar-help" className="mt-2 text-sm leading-6 text-slate-600">
        Choose a first and last night, then set one price for every night in that range. Both nights are included; guests check out the following morning. You can change individual nights by choosing the same date twice.
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">Nights stay closed until you make them available. Confirmed bookings and active booking requests lock their nights until the reservation is released.</p>

      <form onSubmit={saveRange} aria-describedby="calendar-help" className="mt-6 space-y-4">
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Choose nights and price</legend>
          <label className="text-sm font-semibold">First night
            <input type="date" name="first_night" required value={firstNight} onChange={(event) => { setFirstNight(event.target.value); setMessage(null); }} className={inputClass} />
          </label>
          <label className="text-sm font-semibold">Last night (included)
            <input type="date" name="last_night" required min={firstNight} value={lastNight} onChange={(event) => { setLastNight(event.target.value); setMessage(null); }} className={inputClass} />
          </label>
          <label className="text-sm font-semibold">Availability
            <select name="is_available" value={available ? "available" : "closed"} onChange={(event) => { setAvailable(event.target.value === "available"); setMessage(null); }} className={inputClass}>
              <option value="available">Available to book</option>
              <option value="closed">Closed to bookings</option>
            </select>
          </label>
          {available ? (
            <label className="text-sm font-semibold">Price per night (USD)
              <input type="number" name="nightly_price" inputMode="decimal" min="0.50" max="21474836.47" step="0.01" required aria-describedby="nightly-price-help" value={price} onChange={(event) => { setPrice(event.target.value); setMessage(null); }} placeholder="e.g. 150.00" className={inputClass} />
              <span id="nightly-price-help" className="mt-1 block text-xs font-normal text-slate-500">Minimum $0.50 USD per night.</span>
            </label>
          ) : <p className="self-center text-sm text-slate-600">Closing nights keeps any saved prices for your reference.</p>}
        </fieldset>
        <p className="text-xs text-slate-500">Select up to 366 nights at once. Changes apply to future nights and today.</p>
        {rangeError && <p role="alert" className="text-sm text-rose-700">{rangeError}</p>}
        {!rangeError && pastRange && <p role="status" className="text-sm text-amber-800">Past nights are read-only. Choose today or a later first night to make changes.</p>}
        {heldCount > 0 && <p role="status" className="text-sm text-amber-800">This range includes {heldCount} booked or held {heldCount === 1 ? "night" : "nights"}. Choose a range without locked nights to change availability or prices.</p>}
        <button type="submit" disabled={!current || saving || heldCount > 0 || pastRange} className="rounded-lg bg-[#193059] px-5 py-3 text-sm font-semibold text-white hover:bg-[#407FC2] disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? "Saving nights…" : available ? "Save price & open nights" : "Close selected nights"}
        </button>
        {message && <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-rose-700" : "text-emerald-700"}`}>{message.text}</p>}
      </form>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Nights in this range</h3>
          <button type="button" disabled={saving || !!rangeError} onClick={() => { setLoading(true); setReloadToken((value) => value + 1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Refresh calendar</button>
        </div>
        {rangeError ? <p className="mt-4 text-sm text-slate-600">Choose valid dates to view the calendar.</p>
          : loadError ? <p role="alert" className="mt-4 text-sm text-rose-700">{loadError} Use Refresh calendar to try again.</p>
          : !current ? <p role="status" className="mt-4 text-sm text-slate-600">Loading calendar…</p>
          : <div className="mt-4 max-h-[32rem] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Availability and nightly USD prices, including the first and last selected night</caption>
              <thead className="sticky top-0 bg-slate-50 text-slate-600"><tr>
                <th scope="col" className="px-3 py-3 font-semibold sm:px-4">Night</th>
                <th scope="col" className="px-3 py-3 font-semibold sm:px-4">Price (USD)</th>
                <th scope="col" className="px-3 py-3 font-semibold sm:px-4">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{nights.map((night) => (
                <tr key={night.night}>
                  <th scope="row" className="px-3 py-3 font-medium sm:px-4"><time dateTime={night.night}>{nightFormatter.format(new Date(`${night.night}T00:00:00Z`))}</time></th>
                  <td className="px-3 py-3 sm:px-4">{night.price_cents === null ? "Not set" : formatCurrencyFromCents(night.price_cents)}</td>
                  <td className="px-3 py-3 sm:px-4"><span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${night.is_held ? "bg-amber-100 text-amber-900" : night.is_available ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{night.is_held ? "Booked / held" : night.is_available ? "Available" : "Closed"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
      </div>
    </section>
  );
}
