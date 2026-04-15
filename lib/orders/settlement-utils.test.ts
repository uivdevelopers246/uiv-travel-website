import { describe, it, expect } from "vitest";

import {
  computeConfirmedSettlementTotalCents,
  orderBookingsFullyResolvedForSettlement,
} from "./settlement-utils";

describe("computeConfirmedSettlementTotalCents", () => {
  it("sums total_cents for confirmed rows only", () => {
    expect(
      computeConfirmedSettlementTotalCents([
        { status: "confirmed", total_cents: 1000 },
        { status: "declined", total_cents: 500 },
        { status: "confirmed", total_cents: 250 },
      ]),
    ).toBe(1250);
  });

  it("rounds fractional sums to the nearest cent", () => {
    expect(
      computeConfirmedSettlementTotalCents([
        { status: "confirmed", total_cents: 100 },
        { status: "confirmed", total_cents: 100 },
        { status: "confirmed", total_cents: 100.4 },
      ]),
    ).toBe(300);
  });
});

describe("orderBookingsFullyResolvedForSettlement", () => {
  it("is false when pending_approval exists", () => {
    expect(
      orderBookingsFullyResolvedForSettlement([
        { status: "confirmed" },
        { status: "pending_approval" },
      ]),
    ).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(orderBookingsFullyResolvedForSettlement([])).toBe(false);
  });

  it("is true when no pending_approval", () => {
    expect(
      orderBookingsFullyResolvedForSettlement([
        { status: "confirmed" },
        { status: "declined" },
      ]),
    ).toBe(true);
  });

  it("is true when lines are expired or cancelled (no pending_approval)", () => {
    expect(
      orderBookingsFullyResolvedForSettlement([
        { status: "expired" },
        { status: "cancelled" },
      ]),
    ).toBe(true);
  });
});
