import { describe, expect, it } from "vitest";

import {
  formatCurrencyFromCents,
  formatParticipantsLabel,
  formatSlotDateTime,
  formatSpotLabel,
} from "./formatting";

describe("formatCurrencyFromCents", () => {
  it("formats zero dollars", () => {
    expect(formatCurrencyFromCents(0)).toBe("$0.00");
  });

  it("formats representative positive cent values", () => {
    expect(formatCurrencyFromCents(12345)).toBe("$123.45");
  });
});

describe("participant and spot labels", () => {
  it("pluralizes participant labels", () => {
    expect(formatParticipantsLabel(1)).toBe("1 participant");
    expect(formatParticipantsLabel(3)).toBe("3 participants");
  });

  it("pluralizes spot labels", () => {
    expect(formatSpotLabel(1)).toBe("1 spot");
    expect(formatSpotLabel(4)).toBe("4 spots");
  });
});

describe("formatSlotDateTime", () => {
  it("returns a fallback when either timestamp is missing", () => {
    expect(formatSlotDateTime("", "2026-06-12T16:00:00.000Z")).toBe(
      "Date and time unavailable",
    );
    expect(formatSlotDateTime("2026-06-12T14:00:00.000Z", "")).toBe(
      "Date and time unavailable",
    );
  });

  it("matches the existing cart and bookings slot formatting shape", () => {
    const startsAt = "2026-06-12T14:00:00.000Z";
    const endsAt = "2026-06-12T16:00:00.000Z";
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const start = new Date(startsAt);
    const end = new Date(endsAt);

    expect(formatSlotDateTime(startsAt, endsAt)).toBe(
      `${dateFormatter.format(start)} - ${timeFormatter.format(start)} to ${timeFormatter.format(end)}`,
    );
  });
});
