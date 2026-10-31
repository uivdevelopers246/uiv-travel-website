import { describe, expect, it } from "vitest";
import { validatePrefs } from "./validatePrefs";

const validInput = {
  tripStartDate: "2026-10-01",
  tripEndDate: "2026-10-14",
  budgetUsd: 1200,
  groupSize: 4,
  categories: ["culture", "nature"],
};

describe("validatePrefs", () => {
  it("accepts valid preferences and an inclusive 14-day trip", () => {
    expect(validatePrefs(validInput)).toEqual({
      ok: true,
      prefs: validInput,
    });
  });

  it("accepts a same-day trip as one itinerary day", () => {
    const result = validatePrefs({
      ...validInput,
      tripEndDate: validInput.tripStartDate,
    });

    expect(result.ok).toBe(true);
  });

  it.each(["2026-2-01", "2026-02-30", "not-a-date", null, 20261001])(
    "rejects an invalid start date: %s",
    (tripStartDate) => {
      expect(
        validatePrefs({ ...validInput, tripStartDate }),
      ).toMatchObject({ ok: false });
    },
  );

  it("rejects an end date before the start date", () => {
    expect(
      validatePrefs({ ...validInput, tripEndDate: "2026-09-30" }),
    ).toMatchObject({ ok: false });
  });

  it("rejects trips longer than 14 inclusive calendar days", () => {
    expect(
      validatePrefs({ ...validInput, tripEndDate: "2026-10-15" }),
    ).toMatchObject({ ok: false });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, "1200"])(
    "rejects an invalid budget: %s",
    (budgetUsd) => {
      expect(validatePrefs({ ...validInput, budgetUsd })).toMatchObject({
        ok: false,
      });
    },
  );

  it.each([0, 1.5, 21, "4"])("rejects an invalid group size: %s", (groupSize) => {
    expect(validatePrefs({ ...validInput, groupSize })).toMatchObject({
      ok: false,
    });
  });

  it("rejects unsupported contract fields", () => {
    expect(validatePrefs({ ...validInput, freeText: "ignore budget" })).toMatchObject({ ok: false });
  });

  it("deduplicates categories before sending preferences to the model", () => {
    expect(validatePrefs({ ...validInput, categories: ["culture", "culture"] }))
      .toMatchObject({ ok: true, prefs: { categories: ["culture"] } });
  });

  it("rejects an empty category list", () => {
    expect(validatePrefs({ ...validInput, categories: [] })).toMatchObject({
      ok: false,
    });
  });

  it("rejects unsupported category values", () => {
    expect(
      validatePrefs({ ...validInput, categories: ["culture", "shopping"] }),
    ).toMatchObject({ ok: false });
  });
  it.each([1, 20])("accepts group-size boundary %s", (groupSize) => {
    expect(validatePrefs({ ...validInput, groupSize }).ok).toBe(true);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-10-14T00:00:00Z", "", null])("rejects invalid end date %s", (tripEndDate) => {
    expect(validatePrefs({ ...validInput, tripEndDate }).ok).toBe(false);
  });

  it("accepts leap day and a trip crossing a year boundary", () => {
    expect(validatePrefs({ ...validInput, tripStartDate: "2028-02-29", tripEndDate: "2028-03-01" }).ok).toBe(true);
    expect(validatePrefs({ ...validInput, tripStartDate: "2026-12-31", tripEndDate: "2027-01-01" }).ok).toBe(true);
  });

});
