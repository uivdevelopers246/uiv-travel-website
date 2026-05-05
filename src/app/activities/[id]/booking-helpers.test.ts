import { describe, expect, it } from "vitest";

import type { PublicSlotWithCapacity } from "@/lib/slots/types";
import {
  clampParticipants,
  getAvailabilitySummary,
  getRemainingCapacity,
  groupSlotsByDate,
} from "./booking-helpers";

function createSlot(
  overrides: Partial<PublicSlotWithCapacity> & Pick<PublicSlotWithCapacity, "id" | "starts_at" | "ends_at">,
): PublicSlotWithCapacity {
  return {
    id: overrides.id,
    activity_id: overrides.activity_id ?? "activity-1",
    starts_at: overrides.starts_at,
    ends_at: overrides.ends_at,
    max_capacity: overrides.max_capacity ?? 8,
    off_platform_participants: overrides.off_platform_participants ?? 0,
    booked_participants: overrides.booked_participants ?? 0,
    remaining_capacity: overrides.remaining_capacity ?? 8,
  };
}

describe("groupSlotsByDate", () => {
  it("groups slots by date and moves sold-out slots to the bottom", () => {
    const groups = groupSlotsByDate([
      createSlot({
        id: "sold-out",
        starts_at: "2026-06-12T14:00:00.000Z",
        ends_at: "2026-06-12T16:00:00.000Z",
        max_capacity: 6,
        booked_participants: 6,
        remaining_capacity: 0,
      }),
      createSlot({
        id: "available-later",
        starts_at: "2026-06-12T18:00:00.000Z",
        ends_at: "2026-06-12T20:00:00.000Z",
        remaining_capacity: 4,
      }),
      createSlot({
        id: "available-earlier",
        starts_at: "2026-06-12T10:00:00.000Z",
        ends_at: "2026-06-12T12:00:00.000Z",
        remaining_capacity: 2,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      departureCount: 3,
      availableCount: 2,
      soldOut: false,
    });
    expect(groups[0].slots.map((slot) => slot.id)).toEqual([
      "available-earlier",
      "available-later",
      "sold-out",
    ]);
  });
});

describe("clampParticipants", () => {
  it("clamps participants within the available range", () => {
    expect(clampParticipants(7, 4)).toBe(4);
    expect(clampParticipants(0, 4)).toBe(1);
  });

  it("falls back to 1 when the slot is sold out", () => {
    expect(clampParticipants(3, 0)).toBe(1);
  });
});

describe("getAvailabilitySummary", () => {
  it("returns a normal availability label when inventory is healthy", () => {
    expect(
      getAvailabilitySummary(
        createSlot({
          id: "normal",
          starts_at: "2026-06-12T10:00:00.000Z",
          ends_at: "2026-06-12T12:00:00.000Z",
          max_capacity: 8,
          remaining_capacity: 5,
        }),
      ),
    ).toEqual({
      tone: "available",
      badge: "5 spots left",
      detail: "5 of 8 spots remaining",
    });
  });

  it("returns a low-inventory label when few spots remain", () => {
    expect(
      getAvailabilitySummary(
        createSlot({
          id: "low",
          starts_at: "2026-06-12T10:00:00.000Z",
          ends_at: "2026-06-12T12:00:00.000Z",
          max_capacity: 8,
          remaining_capacity: 2,
        }),
      ),
    ).toEqual({
      tone: "low",
      badge: "Only 2 left",
      detail: "2 of 8 spots remaining",
    });
  });

  it("returns a sold-out label when no spots remain", () => {
    expect(
      getAvailabilitySummary(
        createSlot({
          id: "sold-out",
          starts_at: "2026-06-12T10:00:00.000Z",
          ends_at: "2026-06-12T12:00:00.000Z",
          max_capacity: 8,
          remaining_capacity: 0,
        }),
      ),
    ).toEqual({
      tone: "sold-out",
      badge: "Sold out",
      detail: "0 of 8 spots remaining",
    });
  });
});

describe("getRemainingCapacity", () => {
  it("prefers the API-provided remaining capacity", () => {
    expect(
      getRemainingCapacity(
        createSlot({
          id: "api-capacity",
          starts_at: "2026-06-12T10:00:00.000Z",
          ends_at: "2026-06-12T12:00:00.000Z",
          max_capacity: 8,
          off_platform_participants: 1,
          booked_participants: 3,
          remaining_capacity: 2,
        }),
      ),
    ).toBe(2);
  });
});
