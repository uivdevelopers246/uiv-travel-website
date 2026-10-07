import { describe, expect, it, vi } from "vitest";
import { getAccommodationStayQuote, parseCalendarUpdate, validateCalendarRange } from "./service";

const quote = {
  available: true, nights: 2, unit_price_cents: 10000, total_cents: 25000, currency: "usd",
  nightly_prices: [{ night: "2099-07-01", price_cents: 10000 }, { night: "2099-07-02", price_cents: 15000 }],
};

describe("accommodation calendar", () => {
  it("prices variable nightly rates by their sum", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: quote, error: null });
    expect(await getAccommodationStayQuote({ rpc } as never, "stay", "2099-07-01", "2099-07-03")).toEqual(quote);
  });

  it.each([
    { ...quote, total_cents: 20000 },
    { ...quote, unit_price_cents: 15000 },
    { ...quote, nightly_prices: [quote.nightly_prices[0], quote.nightly_prices[0]] },
    { ...quote, nightly_prices: [quote.nightly_prices[0]] },
    { ...quote, available: "true" },
    { ...quote, total_cents: -1 },
  ])("rejects invalid money or date coverage at the database boundary", async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(getAccommodationStayQuote({ rpc } as never, "stay", "2099-07-01", "2099-07-03")).rejects.toThrow();
  });

  it("allows same-night ranges and rejects rollover dates, past writes and oversized ranges", () => {
    expect(validateCalendarRange("2099-07-01", "2099-07-01", true)).toEqual({ first_night: "2099-07-01", last_night: "2099-07-01" });
    expect(() => validateCalendarRange("2099-02-30", "2099-03-01")).toThrow();
    expect(() => validateCalendarRange("2099-07-02", "2099-07-01")).toThrow();
    expect(() => validateCalendarRange("2099-01-01", "2100-01-02")).toThrow();
    expect(() => validateCalendarRange("2000-01-01", "2000-01-01", true)).toThrow();
    expect(() => validateCalendarRange("2000-01-01", "2000-01-01")).not.toThrow();
  });

  it("requires integer cents when opening nights and permits blocking without a price", () => {
    const range = { first_night: "2099-07-01", last_night: "2099-07-03" };
    expect(parseCalendarUpdate({ ...range, is_available: false })).toEqual({ ...range, is_available: false, price_cents: null });
    expect(parseCalendarUpdate({ ...range, is_available: true, price_cents: 50 }).price_cents).toBe(50);
    for (const price of [null, -1, 0, 49, 1.5, "10000", 2147483648]) {
      expect(() => parseCalendarUpdate({ ...range, is_available: true, price_cents: price })).toThrow();
    }
  });
});
