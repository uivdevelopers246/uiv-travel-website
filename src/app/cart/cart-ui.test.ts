import { describe, expect, it } from "vitest";

import type { CartLineWithPreview } from "@/lib/cart/types";

import {
  getCartLineAvailabilityState,
  getCartSummary,
  getCheckoutCallToActionState,
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
        "No charge today. Stripe saves your payment method first and only charges confirmed bookings after vendor approval.",
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
        "Save or reset the participant change on 1 activity before continuing.",
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
