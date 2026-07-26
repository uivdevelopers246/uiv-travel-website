import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/activities/service", () => ({
  getActivityById: vi.fn(),
}));

vi.mock("@/lib/accommodations/service", () => ({
  getAccommodationById: vi.fn(),
}));

vi.mock("@/lib/slots/service", () => ({
  slotPlatformParticipantsBookedBySlotIds: vi.fn(),
}));

import { getActivityById } from "@/lib/activities/service";
import { getAccommodationById } from "@/lib/accommodations/service";
import { slotPlatformParticipantsBookedBySlotIds } from "@/lib/slots/service";
import {
  addOrMergeActivityLine,
  addOrMergeAccommodationLine,
  deleteAllCartLinesForUser,
  listCartLines,
  listCartLinesWithPreview,
  parseAndValidateStayDates,
  priceMinUsdToCents,
  pricePerPersonUsdToCents,
  removeCartLine,
  updateCartLineGuests,
  updateCartLineParticipants,
  validateActivityCartForCheckout,
} from "./service";
import {
  CART_LINE_TYPE_ACTIVITY,
  CART_LINE_TYPE_ACCOMMODATION,
} from "./constants";

const userId = "user-1";
const slotId = "slot-1";
const activityId = "act-1";
const lineId = "line-1";
const stayLineId = "stay-line-1";
const accommodationId = "acc-1";
const vendorId = "vendor-1";
/** Fixed "today" for stay date validation (UTC). */
const stayNow = new Date("2026-07-26T12:00:00.000Z");
const checkIn = "2026-08-01";
const checkOut = "2026-08-04"; // 3 nights

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

const publicAccommodation = {
  id: accommodationId,
  vendor_id: vendorId,
  name: "Beach Villa",
  accommodation_type: "villa",
  bedroom_count: 2,
  bed_count: 3,
  bathroom_count: 2,
  max_guest_capacity: 4,
  price_min_usd: 150,
  price_max_usd: 200,
  check_in_time: "15:00",
  check_out_time: "11:00",
  suitable_for_children: true,
  wheelchair_accessible: false,
  smoking_allowed: false,
  pets_allowed: false,
  beach_access_or_view: true,
  transportation_provided: false,
  amenities_complete: true,
  amenities: ["wifi"],
  address: "1 Beach Rd",
  parish: "St. James",
  transportation_notes: null,
  pickup_notes: null,
  image_url: "https://example.com/villa.jpg",
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
    off_platform_participants: 0,
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

function baseStayCartLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: stayLineId,
    user_id: userId,
    line_type: CART_LINE_TYPE_ACCOMMODATION,
    slot_id: null,
    participants: null,
    unit_price_cents: 15000,
    line_subtotal_cents: 45000,
    line_discount_cents: 0,
    line_total_cents: 45000,
    accommodation_id: accommodationId,
    check_in: checkIn,
    check_out: checkOut,
    guests: 2,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function stayAvailableRpc(held = false) {
  return vi.fn().mockResolvedValue({ data: held, error: null });
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
  vi.mocked(getAccommodationById).mockReset();
  vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockReset();
  vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockResolvedValue(new Map());
  vi.mocked(getActivityById).mockResolvedValue(publicActivity);
  vi.mocked(getAccommodationById).mockResolvedValue(publicAccommodation);
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

describe("priceMinUsdToCents", () => {
  it("converts nightly USD to integer cents", () => {
    expect(priceMinUsdToCents(150)).toBe(15000);
    expect(priceMinUsdToCents(99.5)).toBe(9950);
  });

  it("throws when price is null or non-finite", () => {
    expect(() => priceMinUsdToCents(null)).toThrow(
      "Accommodation price is not set",
    );
    expect(() => priceMinUsdToCents(undefined)).toThrow(
      "Accommodation price is not set",
    );
    expect(() => priceMinUsdToCents(Number.NaN)).toThrow(
      "Accommodation price is not set",
    );
  });
});

describe("parseAndValidateStayDates", () => {
  it("returns nights as check_out minus check_in", () => {
    expect(parseAndValidateStayDates(checkIn, checkOut, stayNow)).toEqual({
      check_in: checkIn,
      check_out: checkOut,
      nights: 3,
    });
  });

  it("throws when check_out is not after check_in", () => {
    expect(() =>
      parseAndValidateStayDates(checkIn, checkIn, stayNow),
    ).toThrow("check_out must be after check_in");
  });

  it("throws when check_in is in the past", () => {
    expect(() =>
      parseAndValidateStayDates("2026-07-01", "2026-07-05", stayNow),
    ).toThrow("check_in must not be in the past");
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
        data: [
          {
            id: activityId,
            title: "Kayak Tour",
            image_url: "https://example.com/kayak.jpg",
          },
        ],
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

    vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockResolvedValue(
      new Map([[slotId, 3]]),
    );

    const rows = await listCartLinesWithPreview(supabase as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ...line,
      activity_title: "Kayak Tour",
      activity_image_url: "https://example.com/kayak.jpg",
      slot_starts_at: "2026-04-06T12:00:00.000Z",
      slot_ends_at: "2026-04-06T14:00:00.000Z",
      max_capacity: 10,
      booked_participants: 3,
      remaining_capacity: 7,
      accommodation_name: "",
      nights: 0,
      stay_dates_available: false,
    });
    expect(slotPlatformParticipantsBookedBySlotIds).toHaveBeenCalledWith(
      supabase,
      [slotId],
    );
  });

  it("includes stay preview fields for accommodation lines", async () => {
    const line = baseStayCartLine({ guests: 2 });
    const cartQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [line], error: null }),
    };
    const accommodationsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [
          {
            id: accommodationId,
            name: "Beach Villa",
            image_url: "https://example.com/villa.jpg",
            max_guest_capacity: 4,
          },
        ],
        error: null,
      }),
    };

    const supabase: Record<string, unknown> = {
      from: vi.fn((table: string) => {
        if (table === "cart_lines") return cartQuery;
        if (table === "accommodations") return accommodationsQuery;
        throw new Error(`unexpected table ${table}`);
      }),
      rpc: stayAvailableRpc(false),
      ...authUser(),
    };

    const rows = await listCartLinesWithPreview(supabase as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ...line,
      accommodation_name: "Beach Villa",
      accommodation_image_url: "https://example.com/villa.jpg",
      nights: 3,
      max_guest_capacity: 4,
      stay_dates_available: true,
      activity_title: "",
      max_capacity: 0,
      remaining_capacity: 0,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("accommodation_stay_is_held", {
      p_accommodation_id: accommodationId,
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
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

    vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockResolvedValue(
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

    vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockResolvedValue(
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

    vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockResolvedValue(
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

describe("addOrMergeAccommodationLine", () => {
  it("inserts a stay line with unit × nights snapshots (guests do not multiply)", async () => {
    const inserted = baseStayCartLine({ guests: 2 });
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
        .mockImplementationOnce(() => cartFindQuery)
        .mockImplementationOnce(() => cartInsertQuery),
      rpc: stayAvailableRpc(false),
      ...authUser(),
    };

    const row = await addOrMergeAccommodationLine(
      supabase as never,
      {
        accommodation_id: accommodationId,
        check_in: checkIn,
        check_out: checkOut,
        guests: 2,
      },
      { now: stayNow },
    );

    expect(row).toEqual(inserted);
    expect(supabase.rpc).toHaveBeenCalledWith("accommodation_stay_is_held", {
      p_accommodation_id: accommodationId,
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    expect(cartInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        line_type: CART_LINE_TYPE_ACCOMMODATION,
        accommodation_id: accommodationId,
        check_in: checkIn,
        check_out: checkOut,
        guests: 2,
        slot_id: null,
        participants: null,
        unit_price_cents: 15000,
        line_subtotal_cents: 45000,
        line_discount_cents: 0,
        line_total_cents: 45000,
      }),
    );
  });

  it("merges by absolute guests (not a delta) and recomputes from current rate", async () => {
    const existing = baseStayCartLine({
      guests: 2,
      unit_price_cents: 10000,
      line_subtotal_cents: 30000,
      line_total_cents: 30000,
    });
    const updated = baseStayCartLine({
      guests: 5,
      unit_price_cents: 15000,
      line_subtotal_cents: 45000,
      line_total_cents: 45000,
    });

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

    vi.mocked(getAccommodationById).mockResolvedValue({
      ...publicAccommodation,
      max_guest_capacity: null,
    });

    const supabase: Record<string, unknown> = {
      from: vi
        .fn()
        .mockImplementationOnce(() => cartFindQuery)
        .mockImplementationOnce(() => cartUpdateQuery),
      rpc: stayAvailableRpc(false),
      ...authUser(),
    };

    const row = await addOrMergeAccommodationLine(
      supabase as never,
      {
        accommodation_id: accommodationId,
        check_in: checkIn,
        check_out: checkOut,
        guests: 5,
      },
      { now: stayNow },
    );

    expect(row.guests).toBe(5);
    expect(cartUpdateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        guests: 5,
        slot_id: null,
        participants: null,
        unit_price_cents: 15000,
        line_subtotal_cents: 45000,
        line_total_cents: 45000,
      }),
    );
  });

  it("allows any guest count when max_guest_capacity is null", async () => {
    const inserted = baseStayCartLine({ guests: 50 });
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

    vi.mocked(getAccommodationById).mockResolvedValue({
      ...publicAccommodation,
      max_guest_capacity: null,
    });

    const supabase: Record<string, unknown> = {
      from: vi
        .fn()
        .mockImplementationOnce(() => cartFindQuery)
        .mockImplementationOnce(() => cartInsertQuery),
      rpc: stayAvailableRpc(false),
      ...authUser(),
    };

    await expect(
      addOrMergeAccommodationLine(
        supabase as never,
        {
          accommodation_id: accommodationId,
          check_in: checkIn,
          check_out: checkOut,
          guests: 50,
        },
        { now: stayNow },
      ),
    ).resolves.toEqual(inserted);
  });

  it("throws when guests exceed max_guest_capacity", async () => {
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      rpc: stayAvailableRpc(false),
      ...authUser(),
    };

    await expect(
      addOrMergeAccommodationLine(
        supabase as never,
        {
          accommodation_id: accommodationId,
          check_in: checkIn,
          check_out: checkOut,
          guests: 5,
        },
        { now: stayNow },
      ),
    ).rejects.toThrow("Guest count exceeds accommodation capacity");
  });

  it("throws when stay dates overlap a holding booking", async () => {
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      rpc: stayAvailableRpc(true),
      ...authUser(),
    };

    await expect(
      addOrMergeAccommodationLine(
        supabase as never,
        {
          accommodation_id: accommodationId,
          check_in: checkIn,
          check_out: checkOut,
          guests: 2,
        },
        { now: stayNow },
      ),
    ).rejects.toThrow("These stay dates are not available");
  });

  it("throws when accommodation price is not set", async () => {
    vi.mocked(getAccommodationById).mockResolvedValue({
      ...publicAccommodation,
      price_min_usd: null,
    });

    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      rpc: stayAvailableRpc(false),
      ...authUser(),
    };

    await expect(
      addOrMergeAccommodationLine(
        supabase as never,
        {
          accommodation_id: accommodationId,
          check_in: checkIn,
          check_out: checkOut,
          guests: 2,
        },
        { now: stayNow },
      ),
    ).rejects.toThrow("Accommodation price is not set");
  });

  it("throws when guests is not a positive integer", async () => {
    const supabase: Record<string, unknown> = {
      from: vi.fn(),
      ...authUser(),
    };

    await expect(
      addOrMergeAccommodationLine(
        supabase as never,
        {
          accommodation_id: accommodationId,
          check_in: checkIn,
          check_out: checkOut,
          guests: 0,
        },
        { now: stayNow },
      ),
    ).rejects.toThrow("guests must be a positive integer");
  });
});

describe("updateCartLineGuests", () => {
  it("sets absolute guests and recomputes stay snapshots", async () => {
    const line = baseStayCartLine({ guests: 2 });
    const updated = baseStayCartLine({
      guests: 3,
      line_subtotal_cents: 45000,
      line_total_cents: 45000,
    });

    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: line, error: null }),
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
        .mockImplementationOnce(() => updateQuery),
      rpc: stayAvailableRpc(false),
      ...authUser(),
    };

    const row = await updateCartLineGuests(
      supabase as never,
      { cart_line_id: stayLineId, guests: 3 },
      { now: stayNow },
    );

    expect(row.guests).toBe(3);
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        guests: 3,
        unit_price_cents: 15000,
        line_subtotal_cents: 45000,
        line_total_cents: 45000,
      }),
    );
  });

  it("throws when line is not an accommodation line", async () => {
    const line = baseCartLine();
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
      updateCartLineGuests(supabase as never, {
        cart_line_id: lineId,
        guests: 2,
      }),
    ).rejects.toThrow("Only accommodation cart lines can update guests");
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

    vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockResolvedValue(
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

    vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockResolvedValue(
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

    vi.mocked(slotPlatformParticipantsBookedBySlotIds).mockResolvedValue(
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
