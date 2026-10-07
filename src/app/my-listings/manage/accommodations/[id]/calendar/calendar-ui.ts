import { parseCalendarUpdate } from "@/lib/accommodation-calendar/service";

export function calendarUpdateFromForm(firstNight: string, lastNight: string, available: boolean, price: string) {
  const trimmed = price.trim();
  if (available && !/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Enter a nightly price in USD with up to two decimal places.");
  }
  const [dollars, cents = ""] = trimmed.split(".");
  const priceCents = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  if (available && priceCents < 50) {
    throw new Error("The nightly price must be at least $0.50 USD.");
  }
  return parseCalendarUpdate({
    first_night: firstNight,
    last_night: lastNight,
    is_available: available,
    ...(available ? { price_cents: priceCents } : {}),
  });
}
