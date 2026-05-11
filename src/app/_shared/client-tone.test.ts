import { describe, expect, it } from "vitest";

import { getSemanticNoticeClasses } from "./client-tone";

describe("getSemanticNoticeClasses", () => {
  it("returns the success classes", () => {
    expect(getSemanticNoticeClasses("success")).toBe(
      "border-emerald-200 bg-emerald-50 text-emerald-800",
    );
  });

  it("returns the warning classes", () => {
    expect(getSemanticNoticeClasses("warning")).toBe(
      "border-amber-200 bg-amber-50 text-amber-900",
    );
  });

  it("returns the error classes", () => {
    expect(getSemanticNoticeClasses("error")).toBe(
      "border-rose-200 bg-rose-50 text-rose-800",
    );
  });
});
