import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";

export type AccommodationStayQuote = {
  available: boolean;
  nights: number;
  unit_price_cents: number;
  total_cents: number;
  currency: "usd";
  nightly_prices: { night: string; price_cents: number }[];
};

export type AccommodationCalendarNight = {
  night: string;
  price_cents: number | null;
  is_available: boolean;
  is_held: boolean;
};

const MAX_CENTS = 2_147_483_647;
const DAY_MS = 86_400_000;

function dateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function validateCalendarRange(first: unknown, last: unknown, futureOnly = false) {
  if (!dateOnly(first) || !dateOnly(last)) throw new Error("Choose valid first and last nights.");
  const nights = (Date.parse(last) - Date.parse(first)) / DAY_MS + 1;
  if (nights < 1 || nights > 366) throw new Error("Choose a range of 1 to 366 nights.");
  if (futureOnly && first < new Date().toISOString().slice(0, 10)) {
    throw new Error("Nights must be today or later.");
  }
  return { first_night: first, last_night: last };
}

function validCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_CENTS;
}

export function parseCalendarUpdate(body: Record<string, unknown>) {
  const range = validateCalendarRange(body.first_night, body.last_night, true);
  if (typeof body.is_available !== "boolean") throw new Error("Choose whether these nights are available.");
  const price = body.price_cents ?? null;
  if ((body.is_available && price === null) || (price !== null && !validCents(price))) {
    throw new Error("Set a valid nightly price in cents for available nights.");
  }
  if (body.is_available && (price as number) < 50) {
    throw new Error("Available nights must cost at least $0.50 USD.");
  }
  return { ...range, is_available: body.is_available, price_cents: price as number | null };
}

/** Validates money and date coverage at the database boundary before checkout uses it. */
export async function getAccommodationStayQuote(
  supabase: SupabaseClient<Database>,
  accommodationId: string,
  checkIn: string,
  checkOut: string,
): Promise<AccommodationStayQuote> {
  const { data, error } = await supabase.rpc("accommodation_stay_quote", {
    p_accommodation_id: accommodationId,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });
  if (error) throw new Error("Could not price accommodation stay");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid accommodation quote");
  const quote = data as unknown as AccommodationStayQuote;
  const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / DAY_MS;
  if (typeof quote.available !== "boolean" || quote.currency !== "usd" ||
      !Number.isInteger(nights) || nights < 1 || nights > 366 || quote.nights !== nights ||
      !validCents(quote.unit_price_cents) || !validCents(quote.total_cents) ||
      !Array.isArray(quote.nightly_prices)) throw new Error("Invalid accommodation quote");
  if (!quote.available && quote.nightly_prices.length === 0 &&
      quote.unit_price_cents === 0 && quote.total_cents === 0) return quote;
  if (quote.nightly_prices.length !== nights) throw new Error("Incomplete accommodation quote");
  let total = 0;
  let minimum = MAX_CENTS;
  quote.nightly_prices.forEach((night, index) => {
    const expectedDate = new Date(Date.parse(checkIn) + index * DAY_MS).toISOString().slice(0, 10);
    if (!night || night.night !== expectedDate || !validCents(night.price_cents) || night.price_cents < 50) {
      throw new Error("Invalid nightly accommodation price");
    }
    total += night.price_cents;
    minimum = Math.min(minimum, night.price_cents);
  });
  if (total !== quote.total_cents || minimum !== quote.unit_price_cents) {
    throw new Error("Inconsistent accommodation quote");
  }
  return quote;
}
