import { describe, it, expect } from "vitest";
import { validateRequest } from "./validateRequest";
const base = { mode: "activities", tripStartDate: "2027-02-01", tripEndDate: "2027-02-05", groupSize: 2, activities: { budgetUsd: 500, categories: ["culture"] } };
const stay = { budgetUsd: 1200, checkInDate: "2027-02-01", checkOutDate: "2027-02-05" };
describe("itinerary request", () => {
 it("accepts both modes", () => {
  expect(validateRequest(base).ok).toBe(true);
  expect(validateRequest({ ...base, mode: "activities_and_accommodation", accommodation: stay }).ok).toBe(true);
 });
 it.each([
  { ...base, mode: undefined }, { ...base, budgetUsd: 500 },
  { ...base, accommodation: stay }, { ...base, mode: "activities_and_accommodation" },
  ...[{ budgetUsd: 0 }, { checkInDate: "2027-02-05" }, { checkOutDate: "2027-02-30" }, { checkInDate: "2027-01-31" }, { checkOutDate: "2027-02-06" }, { unexpected: true }].map(change => ({ ...base, mode: "activities_and_accommodation", accommodation: { ...stay, ...change } }))
 ])("rejects invalid contract %j", input => expect(validateRequest(input).ok).toBe(false));
});
