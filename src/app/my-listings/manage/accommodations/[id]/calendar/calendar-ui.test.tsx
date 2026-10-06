import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarUpdateFromForm } from "./calendar-ui";
import { AccommodationCalendarManager } from "./AccommodationCalendarManager";

afterEach(() => vi.useRealTimers());

describe("host accommodation calendar", () => {
  it("converts exact USD amounts and keeps both boundary nights", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
    expect(calendarUpdateFromForm("2026-12-01", "2026-12-03", true, "123.45")).toEqual({
      first_night: "2026-12-01", last_night: "2026-12-03", is_available: true, price_cents: 12345,
    });
    expect(calendarUpdateFromForm("2026-12-01", "2026-12-01", true, "1.29").price_cents).toBe(129);
    expect(calendarUpdateFromForm("2026-12-01", "2026-12-01", true, "0.50").price_cents).toBe(50);
    expect(calendarUpdateFromForm("2026-12-01", "2026-12-01", true, "2.5").price_cents).toBe(250);
    expect(calendarUpdateFromForm("2026-12-01", "2026-12-03", false, "").price_cents).toBeNull();
    for (const price of ["", "0", "0.49", "1.234", "-1", "1e2", "21474836.48"]) {
      expect(() => calendarUpdateFromForm("2026-12-01", "2026-12-03", true, price)).toThrow();
    }
    expect(() => calendarUpdateFromForm("2026-12-03", "2026-12-01", true, "100")).toThrow();
  });

  it("renders native labeled dates, inclusive instructions and disables saving until availability loads", () => {
    const html = renderToStaticMarkup(<AccommodationCalendarManager accommodationId="stay-1" initialFirstNight="2099-01-01" initialLastNight="2099-01-30" />);
    expect(html.match(/type="date"/g)).toHaveLength(2);
    expect(html).toContain('name="first_night"');
    expect(html).toContain('name="last_night"');
    expect(html).toContain("Last night (included)");
    expect(html).toContain("Both nights are included");
    expect(html).toContain("Nights stay closed until you make them available");
    expect(html).toContain("Price per night (USD)");
    expect(html).toContain('min="0.50"');
    expect(html).toContain("Minimum $0.50 USD per night.");
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
    expect(html).toContain("Loading calendar");
  });
});
