import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BookingCalendarMonth } from "./AccommodationBookingCalendar";
import type { BookingCalendarNight } from "./calendar-helpers";

const nights: BookingCalendarNight[] = Array.from({ length: 31 }, (_, i) => ({
  night: `2026-10-${String(i + 1).padStart(2, "0")}`,
  price_cents: i === 9 ? 12550 : i === 10 ? 20000 : i === 12 ? 15000 : null,
}));
const props = {
  month: "2026-10-01", today: "2026-10-02", checkIn: "", checkOut: "", nights,
  onMonthChange: vi.fn(), onSelect: vi.fn(), onRetry: vi.fn(),
};
function dayButton(html: string, day: number) {
  return html.match(new RegExp(`<button\\b[^>]*aria-label="[^"]*October ${day}, 2026[^>]*>`))?.[0] ?? "";
}

describe("nightly booking calendar", () => {
  it("shows each available price and disables darkened days without prices", () => {
    const html = renderToStaticMarkup(<BookingCalendarMonth {...props} />);
    expect(html).toContain("October 2026 nightly prices in USD");
    expect(dayButton(html, 10)).toContain("$125.50 per night");
    expect(dayButton(html, 11)).toContain("$200 per night");
    expect(dayButton(html, 10)).not.toContain('disabled=""');
    expect(dayButton(html, 12)).toContain("Unavailable");
    expect(dayButton(html, 12)).toContain('disabled=""');
    expect(dayButton(html, 12)).toContain("bg-slate-950/40");
    expect(html).toMatch(/aria-label="Previous month" disabled=""/);
    expect(html).toContain("Price per night (USD)");
  });

  it("offers checkout on the first closed night but disables later dates across that gap", () => {
    const html = renderToStaticMarkup(<BookingCalendarMonth {...props} checkIn="2026-10-10" />);
    expect(dayButton(html, 12)).toContain("Check-out only, unavailable overnight");
    expect(dayButton(html, 12)).not.toContain('disabled=""');
    expect(dayButton(html, 13)).toContain('disabled=""');
    expect(dayButton(html, 13)).toContain("unavailable for this stay");
    expect(dayButton(html, 10)).toContain("selected check-in");
    expect(html).toContain("Clear dates");
  });

  it("marks selected endpoints and the occupied nights", () => {
    const html = renderToStaticMarkup(<BookingCalendarMonth {...props} checkIn="2026-10-10" checkOut="2026-10-12" />);
    expect(dayButton(html, 10)).toContain("selected check-in");
    expect(dayButton(html, 11)).toContain("selected night");
    expect(dayButton(html, 12)).toContain("selected check-out");
    expect(dayButton(html, 12)).toContain('aria-pressed="true"');
    expect(dayButton(html, 13)).not.toContain('disabled=""');
  });

  it("distinguishes loading, failed reads, and an empty month", () => {
    const loading = renderToStaticMarkup(<BookingCalendarMonth {...props} nights={null} />);
    expect(loading).toContain("Loading nightly prices");
    expect(loading).toContain('aria-busy="true"');
    expect(dayButton(loading, 10)).toContain('disabled=""');
    expect(loading).not.toContain("No available nights this month");
    const failed = renderToStaticMarkup(<BookingCalendarMonth {...props} nights={null} error="Could not load nightly prices." />);
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Retry calendar");
    expect(failed).not.toContain("No available nights this month");
    const empty = renderToStaticMarkup(<BookingCalendarMonth {...props} nights={nights.map((night) => ({ ...night, price_cents: null }))} />);
    expect(empty).toContain("No available nights this month. Try another month.");
  });
});
