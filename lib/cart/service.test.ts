import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/activities/service", () => ({
  getActivityById: vi.fn(),
}));

vi.mock("@/lib/slots/service", () => ({
  sumConfirmedParticipantsBySlotIds: vi.fn(),
}));

import { getActivityById } from "@/lib/activities/service";
import { sumConfirmedParticipantsBySlotIds } from "@/lib/slots/service";
import {
  addOrMergeActivityLine,
  deleteAllCartLinesForUser,
  listCartLines,
  listCartLinesWithPreview,
  pricePerPersonUsdToCents,
  removeCartLine,
  updateCartLineParticipants,
  validateActivityCartForCheckout,
} from "./service";
import { CART_LINE_TYPE_ACTIVITY } from "./constants";

const userId = "user-1";
const slotId = "slot-1";
const activityId = "act-1";
const lineId = "line-1";
const vendorId = "vendor-1";

const publicActivity = {
  id: activityId,
  vendor_id: vendorId,
  title: "Kayak",
  description: null,
  location: null,
  category: "water-sports" as const,
  duration_hours: 2,
  price_per_person: 50,
  max_capacity: 20,
  rating: null,
  image_url: null,
  is_featured: false,
};

function baseSlotRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: slotId,
    activity_id: activityId,
    vendor_id: vendorId,
    starts_at: "2026-04-06T12:00:00.000Z",
    ends_at: "2026-04-06T14:00:00.000Z",
    max_capacity: 10,
    is_cancelled: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseCartLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: lineId,
    user_id: userId,
    line_type: CART_LINE_TYPE_ACTIVITY,
    slot_id: slotId,
    participants: 2,
    unit_price_cents: 5000,
    line_subtotal_cents: 10000,
    line_discount_cents: 0,
    line_total_cents: 10000,
    accommodation_id: null,
    check_in: null,
    check_out: null,
    guests: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function authUser() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
  };
}

beforeEach(() => {
  vi.mocked(getActivityById).mockReset();
  vi.mocked(sumConfirmedParticipantsBySlotIds).mockReset();
  vi.mocked(sumConfirmedParticipantsBySlotIds).mockResolvedValue(new Map());
  vi.mocked(getActivityById).mockResolvedValue(publicActivity);
});

describe("pricePerPersonUsdToCents", () => {
  it("converts USD to integer cents", () => {
    expect(pricePerPersonUsdToCents(50)).toBe(5000);
    expect(pricePerPersonUsdToCents(10.5)).toBe(1050);
  });

  it("throws when price is null, non-finite, or negative result", () => {
    expect(() => pricePerPersonUsdToCents(null)).toThrow(
      "Activity price is not set",
    );
    expect(() => pricePerPersonUsdToCents(undefined)).toThrow(
      "Activity price is not set",
    );
    expect(() => pricePerPersonUsdToCents(Number.NaN)).toThrow(
      "Activity price is not set",
    );
  });
});

describe("listCartLines", () => {
  it("returns empty array when there is no authenticated user", async () => {
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn(),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => cartQuery),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };

    const rows = await listCartLines(supabase as never);
    expect(rows).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns cart lines for the current user", async () => {
    const line = baseCartLine();
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => cartQuery),
      ...authUser(),
    };

    const rows = await listCartLines(supabase as never);
    expect(rows).toEqual([line]);
    expect(cartQuery.order).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
  });

  it("throws when listing fails", async () => {
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "db down" },
      }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => cartQuery),
      ...authUser(),
    };

    await expect(listCartLines(supabase as never)).rejects.toThrow(
      "Could not list cart lines: db down",
    );
  });
});

describe("listCartLinesWithPreview", () => {
  it("returns empty array when cart is empty", async () => {
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => cartQuery),
      ...authUser(),
    };

    const rows = await listCartLinesWithPreview(supabase as never);
    expect(rows).toEqual([]);
  });

  it("joins slot and activity data and capacity preview", async () => {
    const line = baseCartLine({ participants: 2 });
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const slotsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [
          {
            id: slotId,
            activity_id: activityId,
            starts_at: "2026-04-06T12:00:00.000Z",
            ends_at: "2026-04-06T14:00:00.000Z",
            max_capacity: 10,
          },
        ],
        error: null,
      }),
    };
    const activitiesQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: activityId, title: "Kayak Tour" }],
        error: null,
      }),
    };

    const supabase: Record<string, unknown> = {
      from: vi.fn((table: string) => {
        if (table === "cart_lines") return cartQuery;
        if (table === "availability_slots") return slotsQuery;
        if (table === "activities") return activitiesQuery;
        throw new Error(`unexpected table ${table}`);
      }),
      ...authUser(),
    };

    vi.mocked(sumConfirmedParticipantsBySlotIds).mockResolvedValue(
      new Map([[slotId, 3]]),
    );

    const rows = await listCartLinesWithPreview(supabase as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ...line,
      activity_title: "Kayak Tour",
      slot_starts_at: "2026-04-06T12:00:00.000Z",
      slot_ends_at: "2026-04-06T14:00:00.000Z",
      max_capacity: 10,
      booked_participants: 3,
      remaining_capacity: 7,
    });
    expect(sumConfirmedParticipantsBySlotIds).toHaveBeenCalledWith(
      supabase,
      [slotId],
    );
  });
});

describe("addOrMergeActivityLine", () => {
  it("inserts a new activity line with snapshot cents", async () => {
    const inserted = baseCartLine({
      participants: 2,
      unit_price_cents: 5000,
      line_subtotal_cents: 10000,
      line_total_cents: 10000,
    });
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow(),
        error: null,
      }),
    };
    const cartFindQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const cartInsertQuery: Record<string, unknown> = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
    };

    const supabase: Record<string, unknown> = {
      from: vi
        .fn()
        .mockImplementationOnce(() => slotQuery)
        .mockImplementationOnce(() => cartFindQuery)
        .mockImplementationOnce(() => cartInsertQuery),
      ...authUser(),
    };

    vi.mocked(sumConfirmedParticipantsBySlotIds).mockResolvedValue(
      new Map([[slotId, 0]]),
    );

    const row = await addOrMergeActivityLine(supabase as never, {
      slot_id: slotId,
      participants: 2,
    });

    expect(row).toEqual(inserted);
    expect(cartInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        line_type: CART_LINE_TYPE_ACTIVITY,
        slot_id: slotId,
        participants: 2,
        unit_price_cents: 5000,
        line_subtotal_cents: 10000,
        line_discount_cents: 0,
        line_total_cents: 10000,
      }),
    );
  });

  it("merges participants and recomputes snapshots from current unit price", async () => {
    const existing = baseCartLine({
      id: lineId,
      participants: 2,
      unit_price_cents: 5000,
      line_subtotal_cents: 10000,
    });
    const updated = baseCartLine({
      id: lineId,
      participants: 3,
      unit_price_cents: 5000,
      line_subtotal_cents: 15000,
      line_total_cents: 15000,
    });

    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow(),
        error: null,
      }),
    };
    const cartFindQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
    };
    const cartUpdateQuery: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updated, error: null }),
    };

    const supabase: Record<string, unknown> = {
      from: vi
        .fn()
        .mockImplementationOnce(() => slotQuery)
        .mockImplementationOnce(() => cartFindQuery)
        .mockImplementationOnce(() => cartUpdateQuery),
      ...authUser(),
    };

    vi.mocked(sumConfirmedParticipantsBySlotIds).mockResolvedValue(
      new Map([[slotId, 0]]),
    );

    const row = await addOrMergeActivityLine(supabase as never, {
      slot_id: slotId,
      participants: 1,
    });

    expect(row.participants).toBe(3);
    expect(cartUpdateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        participants: 3,
        unit_price_cents: 5000,
        line_subtotal_cents: 15000,
        line_total_cents: 15000,
      }),
    );
  });

  it("throws Unauthorized when auth returns no user", async () => {
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };

    await expect(
      addOrMergeActivityLine(supabase as never, {
        slot_id: slotId,
        participants: 1,
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws when slot is cancelled", async () => {
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow({ is_cancelled: true }),
        error: null,
      }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => slotQuery),
      ...authUser(),
    };

    await expect(
      addOrMergeActivityLine(supabase as never, {
        slot_id: slotId,
        participants: 1,
      }),
    ).rejects.toThrow("This slot is no longer available");
  });

  it("throws when activity is not published or missing", async () => {
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow(),
        error: null,
      }),
    };
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn((table: string) =>
        table === "availability_slots" ? slotQuery : cartQuery,
      ),
      ...authUser(),
    };

    vi.mocked(getActivityById).mockResolvedValueOnce(null);

    await expect(
      addOrMergeActivityLine(supabase as never, {
        slot_id: slotId,
        participants: 1,
      }),
    ).rejects.toThrow("Activity is not available for booking");
  });

  it("throws when remaining capacity is exceeded", async () => {
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow({ max_capacity: 5 }),
        error: null,
      }),
    };
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn((table: string) =>
        table === "availability_slots" ? slotQuery : cartQuery,
      ),
      ...authUser(),
    };

    vi.mocked(sumConfirmedParticipantsBySlotIds).mockResolvedValue(
      new Map([[slotId, 4]]),
    );

    await expect(
      addOrMergeActivityLine(supabase as never, {
        slot_id: slotId,
        participants: 2,
      }),
    ).rejects.toThrow("Not enough spots left for this time slot");
  });

  it("throws when participants delta is not a positive integer", async () => {
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      ...authUser(),
    };

    await expect(
      addOrMergeActivityLine(supabase as never, {
        slot_id: slotId,
        participants: 0,
      }),
    ).rejects.toThrow("participants must be a positive integer");
  });
});

describe("updateCartLineParticipants", () => {
  it("updates absolute participant count and snapshots", async () => {
    const line = baseCartLine({ participants: 2 });
    const updated = baseCartLine({
      participants: 4,
      line_subtotal_cents: 20000,
      line_total_cents: 20000,
    });

    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: line, error: null }),
    };
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow(),
        error: null,
      }),
    };
    const updateQuery: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updated, error: null }),
    };

    const supabase: Record<string, unknown> = {
      from: vi
        .fn()
        .mockImplementationOnce(() => loadQuery)
        .mockImplementationOnce(() => slotQuery)
        .mockImplementationOnce(() => updateQuery),
      ...authUser(),
    };

    vi.mocked(sumConfirmedParticipantsBySlotIds).mockResolvedValue(
      new Map([[slotId, 0]]),
    );

    const row = await updateCartLineParticipants(supabase as never, {
      cart_line_id: lineId,
      participants: 4,
    });

    expect(row.participants).toBe(4);
    expect(updateQuery.update).toHaveBeenCalled();
  });

  it("throws when cart line is not found", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => loadQuery),
      ...authUser(),
    };

    await expect(
      updateCartLineParticipants(supabase as never, {
        cart_line_id: lineId,
        participants: 2,
      }),
    ).rejects.toThrow("Cart line not found");
  });

  it("throws when line is not an activity line", async () => {
    const line = baseCartLine({ line_type: "accommodation" });
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: line, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => loadQuery),
      ...authUser(),
    };

    await expect(
      updateCartLineParticipants(supabase as never, {
        cart_line_id: lineId,
        participants: 2,
      }),
    ).rejects.toThrow("Only activity cart lines can be updated");
  });
});

describe("removeCartLine", () => {
  it("deletes by id when row exists", async () => {
    const delQuery: Record<string, unknown> = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: lineId },
        error: null,
      }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => delQuery),
      ...authUser(),
    };

    await removeCartLine(supabase as never, lineId);

    expect(delQuery.delete).toHaveBeenCalled();
    expect(delQuery.eq).toHaveBeenCalledWith("id", lineId);
  });

  it("throws when no row is deleted", async () => {
    const delQuery: Record<string, unknown> = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => delQuery),
      ...authUser(),
    };

    await expect(removeCartLine(supabase as never, lineId)).rejects.toThrow(
      "Cart line not found",
    );
  });

  it("throws Unauthorized without a user", async () => {
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };

    await expect(removeCartLine(supabase as never, lineId)).rejects.toThrow(
      "Unauthorized",
    );
  });
});

describe("validateActivityCartForCheckout", () => {
  it("throws Unauthorized without a user", async () => {
    const supabase: Record<string, unknown> = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };

    await expect(
      validateActivityCartForCheckout(supabase as never),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws when cart is empty", async () => {
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => cartQuery),
      ...authUser(),
    };

    await expect(
      validateActivityCartForCheckout(supabase as never),
    ).rejects.toThrow("Cart is empty");
  });

  it("throws when cart has a non-activity line", async () => {
    const line = baseCartLine({ line_type: "accommodation" });
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => cartQuery),
      ...authUser(),
    };

    await expect(
      validateActivityCartForCheckout(supabase as never),
    ).rejects.toThrow("Checkout is only available for activity items");
  });

  it("passes when activity lines are valid", async () => {
    const line = baseCartLine({ participants: 2 });
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow(),
        error: null,
      }),
    };

    const supabase: Record<string, unknown> = {
      from: vi.fn((table: string) => {
        if (table === "cart_lines") return cartQuery;
        if (table === "availability_slots") return slotQuery;
        throw new Error(`unexpected table ${table}`);
      }),
      ...authUser(),
    };

    vi.mocked(sumConfirmedParticipantsBySlotIds).mockResolvedValue(
      new Map([[slotId, 0]]),
    );

    await expect(
      validateActivityCartForCheckout(supabase as never),
    ).resolves.toBeUndefined();

    expect(getActivityById).toHaveBeenCalledWith(supabase, activityId);
  });

  it("throws when a cart line is missing slot_id", async () => {
    const line = baseCartLine({ slot_id: null });
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => cartQuery),
      ...authUser(),
    };

    await expect(
      validateActivityCartForCheckout(supabase as never),
    ).rejects.toThrow("Cart line is missing a slot");
  });

  it("throws when the slot is cancelled", async () => {
    const line = baseCartLine({ participants: 2 });
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow({ is_cancelled: true }),
        error: null,
      }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn((table: string) => {
        if (table === "cart_lines") return cartQuery;
        if (table === "availability_slots") return slotQuery;
        throw new Error(`unexpected table ${table}`);
      }),
      ...authUser(),
    };

    await expect(
      validateActivityCartForCheckout(supabase as never),
    ).rejects.toThrow("This slot is no longer available");
  });

  it("throws when the activity is not published or missing", async () => {
    const line = baseCartLine({ participants: 2 });
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow(),
        error: null,
      }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn((table: string) => {
        if (table === "cart_lines") return cartQuery;
        if (table === "availability_slots") return slotQuery;
        throw new Error(`unexpected table ${table}`);
      }),
      ...authUser(),
    };

    vi.mocked(getActivityById).mockResolvedValueOnce(null);

    await expect(
      validateActivityCartForCheckout(supabase as never),
    ).rejects.toThrow("Activity is not available for booking");
  });

  it("throws when remaining capacity is exceeded", async () => {
    const line = baseCartLine({ participants: 4 });
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const slotQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: baseSlotRow({ max_capacity: 5 }),
        error: null,
      }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn((table: string) => {
        if (table === "cart_lines") return cartQuery;
        if (table === "availability_slots") return slotQuery;
        throw new Error(`unexpected table ${table}`);
      }),
      ...authUser(),
    };

    vi.mocked(sumConfirmedParticipantsBySlotIds).mockResolvedValue(
      new Map([[slotId, 4]]),
    );

    await expect(
      validateActivityCartForCheckout(supabase as never),
    ).rejects.toThrow("Not enough spots left for this time slot");
  });
});

describe("deleteAllCartLinesForUser", () => {
  it("deletes all rows for user_id", async () => {
    const delQuery: Record<string, unknown> = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => delQuery),
    };

    await deleteAllCartLinesForUser(supabase as never, userId);

    expect(supabase.from).toHaveBeenCalledWith("cart_lines");
    expect(delQuery.delete).toHaveBeenCalled();
    expect(delQuery.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("throws on delete error", async () => {
    const delQuery: Record<string, unknown> = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        error: { message: "permission denied" },
      }),
    };
    const supabase: Record<string, unknown> = {
      from: vi.fn(() => delQuery),
    };

    await expect(
      deleteAllCartLinesForUser(supabase as never, userId),
    ).rejects.toThrow("Could not clear cart lines for user: permission denied");
  });
});
