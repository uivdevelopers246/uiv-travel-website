import { describe, expect, it } from "vitest";

import { buildLoginRedirectHref } from "./client-auth";

describe("buildLoginRedirectHref", () => {
  it("builds a cart login redirect href", () => {
    expect(buildLoginRedirectHref("/cart")).toBe("/auth/login?redirect=%2Fcart");
  });

  it("builds a bookings login redirect href", () => {
    expect(buildLoginRedirectHref("/my-trip/bookings")).toBe(
      "/auth/login?redirect=%2Fmy-trip%2Fbookings",
    );
  });

  it("encodes login redirect hrefs with query params", () => {
    expect(
      buildLoginRedirectHref("/my-trip/bookings?checkout=success&order_id=abc123"),
    ).toBe(
      "/auth/login?redirect=%2Fmy-trip%2Fbookings%3Fcheckout%3Dsuccess%26order_id%3Dabc123",
    );
  });
});
