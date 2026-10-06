import { describe, expect, it } from "vitest";

import type { CartLineWithPreview } from "@/lib/cart/types";

import {
  getCartLineAvailabilityState,
  getCartSummary,
  getCheckoutCallToActionState,
  getDraftLineTotalCents,
  getLineParticipants,
  getSavedStayNightlyPrices,
} from "./cart-ui";

function makeLine(
  overrides: Partial<CartLineWithPreview> = {},
): CartLineWithPreview {
  return {
    id: "line-1",
    user_id: "user-1",
    line_type: "activity",
    slot_id: "slot-1",
    participants: 2,
    unit_price_cents: 12500,
    line_subtotal_cents: 25000,
    line_discount_cents: 0,
    line_total_cents: 25000,
    accommodation_id: null,
    check_in: null,
    check_out: null,
    guests: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    activity_title: "Island Sail",
    activity_image_url: "https://example.com/island-sail.jpg",
    slot_starts_at: "2026-06-12T14:00:00.000Z",
    slot_ends_at: "2026-06-12T16:00:00.000Z",
    max_capacity: 12,
    off_platform_participants: 3,
    booked_participants: 4,
    remaining_capacity: 5,
    accommodation_name: "",
    accommodation_image_url: null,
    nights: 0,
    max_guest_capacity: null,
    stay_dates_available: false,
    ...overrides,
  };
}

describe("getCartSummary", () => {
  it("returns activity, participant, and price totals", () => {
    expect(
      getCartSummary([
        makeLine(),
        makeLine({
          id: "line-2",
          participants: 1,
          line_subtotal_cents: 18000,
          line_total_cents: 18000,
          unit_price_cents: 18000,
        }),
      ]),
    ).toEqual({
      activityCount: 2,
      accommodationCount: 0,
      participantCount: 3,
      subtotalCents: 43000,
      totalCents: 43000,
    });
  });
});

describe("getCartLineAvailabilityState", () => {
  it("marks lines unavailable when preview data is missing", () => {
    expect(
      getCartLineAvailabilityState(
        makeLine({
          activity_title: "",
        }),
      ),
    ).toMatchObject({
      kind: "unavailable",
      canEditParticipants: false,
    });
  });

  it("marks lines with too many participants as needing attention", () => {
    expect(
      getCartLineAvailabilityState(
        makeLine({
          participants: 4,
          remaining_capacity: 2,
        }),
      ),
    ).toMatchObject({
      kind: "capacity",
      canEditParticipants: true,
    });
  });

  it("marks valid lines as ready", () => {
    expect(getCartLineAvailabilityState(makeLine())).toMatchObject({
      kind: "valid",
      canEditParticipants: true,
    });
  });
});

describe("getCheckoutCallToActionState", () => {
  it("returns a ready checkout state for a clean valid cart", () => {
    expect(
      getCheckoutCallToActionState({
        lines: [makeLine()],
        dirtyLineCount: 0,
        hasPendingMutation: false,
      }),
    ).toEqual({
      disabled: false,
      label: "Save payment method",
      supportText:
        "No charge at checkout. Stripe saves your payment method first and only charges confirmed bookings after vendor approval.",
      blockingMessage: null,
    });
  });

  it("blocks checkout when participant edits are still dirty", () => {
    expect(
      getCheckoutCallToActionState({
        lines: [makeLine()],
        dirtyLineCount: 1,
        hasPendingMutation: false,
      }),
    ).toMatchObject({
      disabled: true,
      blockingMessage:
        "Save or reset the guest or participant change on 1 request before continuing.",
    });
  });

  it("blocks checkout when the cart contains an invalid line", () => {
    expect(
      getCheckoutCallToActionState({
        lines: [
          makeLine({
            slot_starts_at: "",
            slot_ends_at: "",
          }),
        ],
        dirtyLineCount: 0,
        hasPendingMutation: false,
      }),
    ).toMatchObject({
      disabled: true,
      blockingMessage:
        "Resolve the unavailable or over-capacity request in your cart before saving a payment method.",
    });
  });
});

function makeStay(overrides: Partial<CartLineWithPreview> = {}) {
  return makeLine({
    line_type: "accommodation", accommodation_id: "stay-1", accommodation_name: "Beach Villa",
    activity_title: "", participants: null, guests: 3, check_in: "2099-08-01", check_out: "2099-08-04",
    nights: 3, max_guest_capacity: 4, stay_dates_available: true,
    unit_price_cents: 15000, line_subtotal_cents: 45000, line_total_cents: 45000, ...overrides,
  });
}

describe("accommodation cart", () => {
  it("allows accommodation-only and mixed carts to reach checkout", () => {
    for (const lines of [[makeStay()], [makeLine(), makeStay()]]) {
      expect(getCheckoutCallToActionState({ lines, dirtyLineCount: 0, hasPendingMutation: false }).disabled).toBe(false);
    }
  });

  it("keeps nightly pricing unchanged when guests change and counts stays separately", () => {
    expect(getLineParticipants(makeStay())).toBe(3);
    expect(getDraftLineTotalCents(makeStay(), 4)).toBe(45000);
    expect(getCartSummary([makeLine(), makeStay()])).toEqual({
      activityCount: 1, accommodationCount: 1, participantCount: 2,
      subtotalCents: 70000, totalCents: 70000,
    });
  });

  it("preserves the saved sum of varying nightly prices for every guest count", () => {
    const stay = makeStay({
      line_total_cents: 52000,
      stay_nightly_prices: [
        { night: "2099-08-01", price_cents: 15000 },
        { night: "2099-08-02", price_cents: 17000 },
        { night: "2099-08-03", price_cents: 20000 },
      ],
    });
    for (const guests of [1, 2, 4]) expect(getDraftLineTotalCents(stay, guests)).toBe(52000);
    expect(getCartSummary([stay]).totalCents).toBe(52000);
    expect(getSavedStayNightlyPrices(stay)).toEqual(stay.stay_nightly_prices);
    expect(getSavedStayNightlyPrices({ ...stay, line_total_cents: 45000 })).toEqual([]);
    expect(getSavedStayNightlyPrices({ ...stay, stay_price_changed: true })).toEqual([]);
    expect(getSavedStayNightlyPrices({ ...stay, stay_nightly_prices: undefined })).toEqual([]);
  });

  it("blocks checkout when the host changed prices and asks the guest to review them", () => {
    const stay = makeStay({ stay_price_changed: true });
    expect(getCartLineAvailabilityState(stay)).toMatchObject({
      kind: "price_changed", canEditParticipants: false,
    });
    expect(getCheckoutCallToActionState({ lines: [stay], dirtyLineCount: 0, hasPendingMutation: false })).toMatchObject({
      disabled: true,
      blockingMessage: "Review the changed nightly prices and add the affected stays to your cart again before saving a payment method.",
    });
  });

  it.each([
    { stay_dates_available: false }, { accommodation_name: "" },
    { check_in: "2020-01-01" }, { nights: 0 }, { check_in: null }, { check_out: null },
  ])("blocks unavailable stays %o", (overrides) => {
    expect(getCartLineAvailabilityState(makeStay(overrides)).kind).toBe("unavailable");
  });

  it("lets buyers reduce guest count when capacity has decreased", () => {
    expect(getCartLineAvailabilityState(makeStay({ guests: 5 }))).toMatchObject({
      kind: "capacity", canEditParticipants: true,
    });
  });
});
