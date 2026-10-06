import { nextStayDate } from "./booking-helpers";

export type BookingCalendarNight = { night: string; price_cents: number | null };

const DAY_MS = 86_400_000;

export function getBookingMonth(value: string, offset = 0) {
  const first = new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + offset);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  return {
    first: first.toISOString().slice(0, 10),
    last: last.toISOString().slice(0, 10),
    leadingDays: first.getUTCDay(),
    days: last.getUTCDate(),
    label: first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

/** Include intervening nights when choosing a checkout in a later month. */
export function getBookingCalendarRanges(month: string, checkIn: string, checkOut: string) {
  const { first, last } = getBookingMonth(month);
  const ranges = [{ from: first, to: last }];
  if (!checkOut && nextStayDate(checkIn) && checkIn < first &&
    (Date.parse(first) - Date.parse(checkIn)) / DAY_MS <= 366) {
    ranges.push({ from: checkIn, to: new Date(Date.parse(first) - DAY_MS).toISOString().slice(0, 10) });
  }
  return ranges;
}

export function canCheckOutOn(date: string, checkIn: string, nights: ReadonlyMap<string, number | null>) {
  const length = (Date.parse(date) - Date.parse(checkIn)) / DAY_MS;
  if (!Number.isInteger(length) || length < 1 || length > 366) return false;
  for (let night = checkIn; night < date; night = nextStayDate(night)!) {
    const price = nights.get(night);
    if (price == null || price < 50) return false;
  }
  return true;
}

/** Reject partial or malformed responses instead of displaying them as availability. */
export function isBookingCalendarResponse(
  value: unknown, from: string, to: string,
): value is { nights: BookingCalendarNight[] } {
  if (!value || typeof value !== "object" || !("nights" in value) || !Array.isArray(value.nights)) return false;
  const count = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (value.nights.length !== count) return false;
  let expected = from;
  for (const night of value.nights) {
    if (!night || night.night !== expected || (night.price_cents !== null &&
      (!Number.isSafeInteger(night.price_cents) || night.price_cents < 50 || night.price_cents > 2_147_483_647))) return false;
    expected = nextStayDate(expected)!;
  }
  return true;
}
