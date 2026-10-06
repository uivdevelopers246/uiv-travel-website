import { describe, expect, it, vi } from "vitest";
import { withAccommodationBookablePrices } from "./pricing";

describe("accommodation display prices", () => {
  it("replaces legacy prices with one batched range read while preserving row order", async () => {
    const rows = [
      { id: "villa", name: "Villa", price_min_usd: 1, price_max_usd: 999 },
      { id: "closed", name: "Closed", price_min_usd: 50, price_max_usd: 75 },
      { id: "missing", name: "Missing", price_min_usd: 20, price_max_usd: 20 },
      { id: "villa", name: "Same villa", price_min_usd: 1, price_max_usd: 999 },
    ];
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { accommodation_id: "closed", price_min_usd: null, price_max_usd: null },
        { accommodation_id: "villa", price_min_usd: 100.5, price_max_usd: 150 },
      ],
      error: null,
    });
    const result = await withAccommodationBookablePrices({ rpc } as never, rows);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("accommodation_bookable_price_ranges", {
      p_accommodation_ids: ["villa", "closed", "missing"],
    });
    expect(result).toEqual([
      { ...rows[0], price_min_usd: 100.5, price_max_usd: 150 },
      { ...rows[1], price_min_usd: null, price_max_usd: null },
      { ...rows[2], price_min_usd: null, price_max_usd: null },
      { ...rows[3], price_min_usd: 100.5, price_max_usd: 150 },
    ]);
    expect(rows[0].price_min_usd).toBe(1);
  });

  it("skips the query for an empty listing result", async () => {
    const rpc = vi.fn();
    expect(await withAccommodationBookablePrices({ rpc } as never, [])).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not fall back to old listing prices when the calendar query fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Database unavailable" } });
    await expect(withAccommodationBookablePrices({ rpc } as never, [
      { id: "villa", price_min_usd: 1, price_max_usd: 999 },
    ])).rejects.toThrow("Could not load accommodation prices");
  });
});
