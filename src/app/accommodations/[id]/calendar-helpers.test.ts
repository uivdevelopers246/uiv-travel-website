import { describe, expect, it } from "vitest";
import { canCheckOutOn, getBookingCalendarRanges, getBookingMonth, isBookingCalendarResponse } from "./calendar-helpers";

describe("booking calendar dates", () => {
  it("aligns leap-year months and navigates across years using calendar dates", () => {
    expect(getBookingMonth("2028-02-01")).toEqual({
      first: "2028-02-01", last: "2028-02-29", days: 29, leadingDays: 2, label: "February 2028",
    });
    expect(getBookingMonth("2026-12-01", 1).first).toBe("2027-01-01");
    expect(getBookingMonth("2027-01-01", -1).first).toBe("2026-12-01");
  });

  it("loads every intervening night for a stay spanning months, within the API range limit", () => {
    expect(getBookingCalendarRanges("2027-03-01", "2027-01-30", "")).toEqual([
      { from: "2027-03-01", to: "2027-03-31" }, { from: "2027-01-30", to: "2027-02-28" },
    ]);
    expect(getBookingCalendarRanges("2027-03-01", "2027-01-30", "2027-03-05")).toEqual([
      { from: "2027-03-01", to: "2027-03-31" },
    ]);
    expect(getBookingCalendarRanges("2027-10-01", "2026-10-02", "")).toEqual([
      { from: "2027-10-01", to: "2027-10-31" }, { from: "2026-10-02", to: "2027-09-30" },
    ]);
    expect(getBookingCalendarRanges("2028-03-01", "2026-10-02", "")).toHaveLength(1);
  });

  it("allows checkout on a closed night but never a stay across it or an unloaded night", () => {
    const prices = new Map([
      ["2026-10-30", 12550], ["2026-10-31", 20000], ["2026-11-01", null], ["2026-11-02", 15000],
    ]);
    expect(canCheckOutOn("2026-11-01", "2026-10-30", prices)).toBe(true);
    expect(canCheckOutOn("2026-11-02", "2026-10-30", prices)).toBe(false);
    expect(canCheckOutOn("2026-11-03", "2026-10-30", prices)).toBe(false);
    expect(canCheckOutOn("2026-10-30", "2026-10-30", prices)).toBe(false);
    expect(canCheckOutOn("2026-10-29", "2026-10-30", prices)).toBe(false);
    expect(canCheckOutOn("2026-11-01", "2026-10-29", prices)).toBe(false);
    expect(canCheckOutOn("2026-11-03", "2026-11-02", prices)).toBe(true);
  });

  it("allows a full 366-night stay and refuses a 367th night", () => {
    const start = Date.parse("2027-01-15");
    const dates = Array.from({ length: 368 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
    const prices = new Map(dates.map((date) => [date, 10000]));
    expect(canCheckOutOn(dates[366], dates[0], prices)).toBe(true);
    expect(canCheckOutOn(dates[367], dates[0], prices)).toBe(false);
  });

  it("requires complete ordered dates and valid prices while accepting unavailable nights", () => {
    const nights = [{ night: "2026-10-30", price_cents: 12550 }, { night: "2026-10-31", price_cents: null }];
    const validate = (value: unknown) => isBookingCalendarResponse(value, "2026-10-30", "2026-10-31");
    expect(validate({ nights })).toBe(true);
    for (const invalid of [null, {}, { nights: [] }, { nights: nights.slice(0, 1) }, { nights: [...nights].reverse() },
      ...[undefined, 0, 49, -100, 125.5, "12550", 2_147_483_648].map((price_cents) => ({ nights: [{ ...nights[0], price_cents }, nights[1]] })),
    ]) expect(validate(invalid)).toBe(false);
  });
});
