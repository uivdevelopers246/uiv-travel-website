import { describe, expect, it } from "vitest";

import {
  buildActivityDetailLoginRedirect,
  getAddToCartSuccessMessage,
} from "./cart-helpers";

describe("buildActivityDetailLoginRedirect", () => {
  it("returns a safe login redirect back to the activity page", () => {
    expect(buildActivityDetailLoginRedirect("activity-123")).toBe(
      "/auth/login?redirect=%2Factivities%2Factivity-123",
    );
  });
});

describe("getAddToCartSuccessMessage", () => {
  it("returns merge copy when the slot already existed in the cart", () => {
    expect(
      getAddToCartSuccessMessage({
        requestedParticipants: 2,
        mergedParticipants: 4,
        slotDateLabel: "Friday, June 12, 2026",
      }),
    ).toBe(
      "Updated your cart to 4 participants for Friday, June 12, 2026. Review your cart to save your payment method.",
    );
  });

  it("returns new-add copy when the slot is added for the first time", () => {
    expect(
      getAddToCartSuccessMessage({
        requestedParticipants: 1,
        mergedParticipants: 1,
        slotDateLabel: "Friday, June 12, 2026",
      }),
    ).toBe(
      "Added 1 participant for Friday, June 12, 2026. Review your cart to save your payment method and submit the request.",
    );
  });
});
