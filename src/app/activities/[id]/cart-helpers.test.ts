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
        slotDateTimeLabel: "Friday, June 12, 2026 at 10:00 AM - 12:00 PM",
      }),
    ).toBe(
      "Updated your cart to 4 participants for Friday, June 12, 2026 at 10:00 AM - 12:00 PM. Review your cart to save a payment method. You will only be charged later if the vendor confirms availability.",
    );
  });

  it("returns new-add copy when the slot is added for the first time", () => {
    expect(
      getAddToCartSuccessMessage({
        requestedParticipants: 1,
        mergedParticipants: 1,
        slotDateTimeLabel: "Friday, June 12, 2026 at 10:00 AM - 12:00 PM",
      }),
    ).toBe(
      "Added 1 participant for Friday, June 12, 2026 at 10:00 AM - 12:00 PM. Review your cart to save a payment method. You will only be charged later if the vendor confirms availability.",
    );
  });
});
