import { describe, expect, it } from "vitest";
import { buildAccommodationLoginRedirect, getStaySelectionError, isStayQuoteForSelection, nextStayDate } from "./booking-helpers";

const now = new Date("2026-09-24T12:00:00Z");
const selection = { checkIn: "2026-09-24", checkOut: "2026-09-27", guests: "2" };

describe("stay selection", () => {
  it("accepts today and enforces real dates, overnight stays, and guest capacity", () => {
    expect(getStaySelectionError(selection, 2, now)).toBeNull();
    expect(getStaySelectionError({ ...selection, checkIn: "2026-09-23" }, 2, now)).toContain("past");
    expect(getStaySelectionError({ ...selection, checkOut: selection.checkIn }, 2, now)).toContain("after");
    expect(getStaySelectionError({ ...selection, checkIn: "2027-02-30", checkOut: "2027-03-02" }, 2, now)).toContain("valid");
    expect(getStaySelectionError({ ...selection, guests: "3" }, 2, now)).toContain("up to 2");
    for (const guests of ["", "0", "-1", "1.5", "NaN", "Infinity"]) {
      expect(getStaySelectionError({ ...selection, guests }, null, now)).toContain("whole number");
    }
    expect(getStaySelectionError({ ...selection, guests: "20" }, null, now)).toBeNull();
  });

  it("rejects malformed dates, impossible days, missing fields, and reversed dates", () => {
    for (const checkIn of ["2026-9-24", "2026-00-24", "2026-13-24", "2026-09-00", "2026-09-31", "2027-02-29", "not-a-date", "2026-09-24T00:00:00Z"]) {
      expect(getStaySelectionError({ ...selection, checkIn, checkOut: "2027-03-01" }, 2, now)).toContain("valid");
    }
    expect(getStaySelectionError({ ...selection, checkIn: "" }, 2, now)).toContain("Choose");
    expect(getStaySelectionError({ ...selection, checkOut: "" }, 2, now)).toContain("Choose");
    expect(getStaySelectionError({ ...selection, checkOut: "2026-09-23" }, 2, now)).toContain("after");
    expect(getStaySelectionError({ ...selection, checkOut: "2026-09-31" }, 2, now)).toContain("valid");
    expect(getStaySelectionError({ ...selection, guests: "2" }, 1, now)).toContain("1 guest.");
    expect(getStaySelectionError({ ...selection, guests: "9007199254740992" }, null, now)).toContain("whole number");
    expect(getStaySelectionError({ checkIn: "2028-02-29", checkOut: "2028-03-01", guests: "1" }, 1, now)).toBeNull();
    expect(getStaySelectionError({ ...selection, checkOut: "2027-09-26" }, 2, now)).toContain("366 nights");
  });

  it("increments date-only values across leap days and daylight-saving changes", () => {
    expect(nextStayDate("2028-02-28")).toBe("2028-02-29");
    expect(nextStayDate("2028-02-29")).toBe("2028-03-01");
    expect(nextStayDate("2026-03-08")).toBe("2026-03-09");
    expect(nextStayDate("2026-12-31")).toBe("2027-01-01");
    expect(nextStayDate("2027-02-29")).toBeUndefined();
    expect(nextStayDate("")).toBeUndefined();
  });

  it("preserves the stay selection when authentication returns to the booking form", () => {
    const login = new URL(buildAccommodationLoginRedirect("stay-123", selection), "https://example.test");
    const redirect = new URL(login.searchParams.get("redirect")!, "https://example.test");
    expect(redirect.pathname).toBe("/accommodations/stay-123");
    expect(redirect.searchParams.get("check_in")).toBe(selection.checkIn);
    expect(redirect.searchParams.get("check_out")).toBe(selection.checkOut);
    expect(redirect.searchParams.get("guests")).toBe("2");
    expect(redirect.hash).toBe("#accommodation-booking");
  });

  it("encodes path and query delimiters without creating a second redirect", () => {
    const login = new URL(buildAccommodationLoginRedirect("stay?redirect=//example.test", {
      ...selection, guests: "2&redirect=https://example.test",
    }), "https://booking.test");
    expect([...login.searchParams.keys()]).toEqual(["redirect"]);
    const redirect = new URL(login.searchParams.get("redirect")!, "https://booking.test");
    expect(redirect.origin).toBe("https://booking.test");
    expect(redirect.searchParams.get("guests")).toBe("2&redirect=https://example.test");
    expect(redirect.searchParams.has("redirect")).toBe(false);
  });
});

describe("nightly stay quote", () => {
  const quote = {
    available: true, currency: "usd", nights: 3, unit_price_cents: 12500, total_cents: 47500,
    nightly_prices: [
      { night: "2026-09-24", price_cents: 12500 },
      { night: "2026-09-25", price_cents: 15000 },
      { night: "2026-09-26", price_cents: 20000 },
    ],
  };

  it("accepts the sum of different nightly rates without multiplying the minimum rate", () => {
    expect(isStayQuoteForSelection(quote, selection)).toBe(true);
    expect(isStayQuoteForSelection({ ...quote, total_cents: quote.unit_price_cents * quote.nights }, selection)).toBe(false);
    expect(isStayQuoteForSelection({ ...quote, available: false }, selection)).toBe(true);
  });

  it("requires exactly the requested nights and validates money", () => {
    for (const invalid of [
      null, {}, { ...quote, nights: 2 }, { ...quote, currency: "eur" },
      { ...quote, unit_price_cents: 15000 }, { ...quote, total_cents: NaN },
      { ...quote, nightly_prices: quote.nightly_prices.slice(0, 2) },
      { ...quote, nightly_prices: [...quote.nightly_prices].reverse() },
      { ...quote, nightly_prices: quote.nightly_prices.map((night) => ({ ...night, price_cents: -1 })) },
    ]) {
      expect(isStayQuoteForSelection(invalid, selection)).toBe(false);
    }
    expect(isStayQuoteForSelection(quote, { ...selection, checkOut: "2026-09-28" })).toBe(false);
  });

  it("accepts closed nights with no quote but never treats them as a free available stay", () => {
    const closed = { ...quote, available: false, unit_price_cents: 0, total_cents: 0, nightly_prices: [] };
    expect(isStayQuoteForSelection(closed, selection)).toBe(true);
    expect(isStayQuoteForSelection({ ...closed, available: true }, selection)).toBe(false);
    expect(isStayQuoteForSelection({ ...closed, total_cents: 47500 }, selection)).toBe(false);
  });
});
