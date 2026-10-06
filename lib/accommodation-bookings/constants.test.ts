import { expect, it } from "vitest";
import { hasStartedConfirmedStay } from "./constants";

it("matches the UTC date boundary for payment recovery and ignores unconfirmed stays", () => {
  const now = Date.parse("2026-09-24T00:30:00Z");
  expect(hasStartedConfirmedStay([{ status: "confirmed", check_in: "2026-09-23" }], now)).toBe(true);
  expect(hasStartedConfirmedStay([{ status: "confirmed", check_in: "2026-09-24" }], now)).toBe(false);
  expect(hasStartedConfirmedStay([{ status: "confirmed", check_in: "2026-09-25" }], now)).toBe(false);
  expect(hasStartedConfirmedStay([{ status: "declined", check_in: "2026-09-23" }], now)).toBe(false);
});
