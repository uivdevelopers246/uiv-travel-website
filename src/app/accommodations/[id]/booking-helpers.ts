import type { AccommodationStayQuote } from "@/lib/accommodation-calendar/service";

export type StaySelection = {
  checkIn: string;
  checkOut: string;
  guests: string;
};

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getStaySelectionError(
  selection: StaySelection,
  maxGuests: number | null,
  now: Date = new Date(),
): string | null {
  if (!selection.checkIn || !selection.checkOut) {
    return "Choose your check-in and check-out dates.";
  }
  if (!isCalendarDate(selection.checkIn) || !isCalendarDate(selection.checkOut)) {
    return "Choose valid check-in and check-out dates.";
  }
  if (selection.checkIn < now.toISOString().slice(0, 10)) {
    return "Check-in cannot be in the past.";
  }
  if (selection.checkOut <= selection.checkIn) {
    return "Check-out must be after check-in.";
  }
  if ((Date.parse(selection.checkOut) - Date.parse(selection.checkIn)) / 86_400_000 > 366) {
    return "Choose a stay of up to 366 nights.";
  }
  const guests = Number(selection.guests);
  if (!Number.isSafeInteger(guests) || guests < 1) {
    return "Enter at least one guest as a whole number.";
  }
  if (maxGuests !== null && guests > maxGuests) {
    return `This stay accommodates up to ${maxGuests} ${maxGuests === 1 ? "guest" : "guests"}.`;
  }
  return null;
}

export function isStayQuoteForSelection(
  value: unknown,
  selection: Pick<StaySelection, "checkIn" | "checkOut">,
): value is AccommodationStayQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as AccommodationStayQuote;
  const nights = (Date.parse(selection.checkOut) - Date.parse(selection.checkIn)) / 86_400_000;
  if (typeof quote.available !== "boolean" || !Number.isSafeInteger(nights) || nights < 1 ||
      quote.nights !== nights ||
      !Number.isSafeInteger(quote.unit_price_cents) || quote.unit_price_cents < 0 ||
      !Number.isSafeInteger(quote.total_cents) || quote.total_cents < 0 ||
      quote.currency !== "usd" || !Array.isArray(quote.nightly_prices)) return false;
  if (!quote.available && quote.nightly_prices.length === 0) {
    return quote.total_cents === 0 && quote.unit_price_cents === 0;
  }
  let expectedNight = selection.checkIn;
  let total = 0;
  for (const night of quote.nightly_prices) {
    if (!night || night.night !== expectedNight ||
        !Number.isSafeInteger(night.price_cents) || night.price_cents < 0) return false;
    total += night.price_cents;
    expectedNight = nextStayDate(expectedNight) ?? "";
  }
  return quote.nightly_prices.length === nights && expectedNight === selection.checkOut &&
    Number.isSafeInteger(total) && total === quote.total_cents &&
    Math.min(...quote.nightly_prices.map((night) => night.price_cents)) === quote.unit_price_cents;
}

export function nextStayDate(value: string): string | undefined {
  if (!isCalendarDate(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildAccommodationLoginRedirect(
  accommodationId: string,
  selection: StaySelection,
): string {
  const query = new URLSearchParams({
    check_in: selection.checkIn,
    check_out: selection.checkOut,
    guests: selection.guests,
  });
  const path = `/accommodations/${encodeURIComponent(accommodationId)}?${query}#accommodation-booking`;
  return `/auth/login?redirect=${encodeURIComponent(path)}`;
}
