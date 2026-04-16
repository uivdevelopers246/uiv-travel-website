import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/activities/service", () => ({
  getActivityById: vi.fn(),
}));

import { getActivityById } from "@/lib/activities/service";
import {
  cancelAvailabilitySlot,
  computeEndsAtIso,
  createAvailabilitySlot,
  listManageSlotsForActivity,
  listPublicSlotsForActivity,
  sumConfirmedParticipantsBySlotIds,
  updateAvailabilitySlot,
} from "./service";

/** Mocks `slot_platform_participants_booked` for tests that use `supabase.rpc`. */
function rpcSlotBookedMock(bookedBySlotId: Record<string, number>) {
  return vi.fn(
    (name: string, args: { p_slot_ids: string[] }) => {
      if (name !== "slot_platform_participants_booked") {
        return Promise.resolve({ data: null, error: null });
      }
      const data = args.p_slot_ids.map((id) => ({
        slot_id: id,
        booked: bookedBySlotId[id] ?? 0,
      }));
      return Promise.resolve({ data, error: null });
    },
  );
}

const activityId = "act-1";
const vendorId = "vendor-1";
const userId = "user-1";

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

function makeBookingsSumQuery() {
  const query: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn(),
  };
  return query;
}

function makePublicSlotsQueries(
  slotsRows: Array<{
    id: string;
    activity_id: string;
    starts_at: string;
    ends_at: string;
    max_capacity: number;
    off_platform_participants?: number;
  }>,
  bookedBySlotId: Record<string, number>,
) {
  const slotsQuery: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn(),
  };

  const rows = slotsRows.map((r) => ({
    ...r,
    off_platform_participants: r.off_platform_participants ?? 0,
  }));

  const supabase: Record<string, unknown> = {
    from: vi.fn((table: string) =>
      table === "availability_slots" ? slotsQuery : {},
    ),
    rpc: rpcSlotBookedMock(bookedBySlotId),
  };

  slotsQuery.order = vi.fn().mockResolvedValue({ data: rows, error: null });

  return { supabase, slotsQuery };
}

function authAndVendorSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
  };
}

describe("computeEndsAtIso", () => {
  it("adds duration_hours to starts_at (UTC)", () => {
    const ends = computeEndsAtIso("2026-04-06T12:00:00.000Z", 2);
    expect(ends).toBe("2026-04-06T14:00:00.000Z");
  });

  it("rejects invalid starts_at", () => {
    expect(() => computeEndsAtIso("not-a-date", 1)).toThrow(
      "starts_at must be a valid ISO 8601 timestamp.",
    );
  });
});

describe("sumConfirmedParticipantsBySlotIds", () => {
  it("returns empty map for empty slot id list", async () => {
    const supabase = { from: vi.fn() } as any;
    const map = await sumConfirmedParticipantsBySlotIds(supabase, []);
    expect(map.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("sums participants per slot_id", async () => {
    const query = makeBookingsSumQuery();
    query.in = vi.fn().mockResolvedValue({
      data: [
        { slot_id: "s1", participants: 2 },
        { slot_id: "s1", participants: 3 },
        { slot_id: "s2", participants: 1 },
      ],
      error: null,
    });
    const supabase = { from: vi.fn(() => query) } as any;

    const map = await sumConfirmedParticipantsBySlotIds(supabase, ["s1", "s2"]);

    expect(map.get("s1")).toBe(5);
    expect(map.get("s2")).toBe(1);
    expect(supabase.from).toHaveBeenCalledWith("activity_bookings");
  });

  it("throws with prefixed message on Supabase error", async () => {
    const query = makeBookingsSumQuery();
    query.in = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "rls" },
    });
    const supabase = { from: vi.fn(() => query) } as any;

    await expect(
      sumConfirmedParticipantsBySlotIds(supabase, ["s1"]),
    ).rejects.toThrow(
      "Could not sum confirmed booking participants for slots: rls",
    );
  });
});

describe("listPublicSlotsForActivity", () => {
  beforeEach(() => {
    vi.mocked(getActivityById).mockReset();
  });

  it("returns [] when activity is not published / not found", async () => {
    vi.mocked(getActivityById).mockResolvedValueOnce(null);
    const supabase = { from: vi.fn() } as any;

    const rows = await listPublicSlotsForActivity(supabase, activityId);
    expect(rows).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns bookable slots with capacity; excludes full slots", async () => {
    vi.mocked(getActivityById).mockResolvedValueOnce(publicActivity as any);
    const now = new Date("2026-04-06T12:00:00.000Z");
    const { supabase } = makePublicSlotsQueries(
      [
        {
          id: "slot-open",
          activity_id: activityId,
          starts_at: "2026-04-07T10:00:00.000Z",
          ends_at: "2026-04-07T12:00:00.000Z",
          max_capacity: 10,
          off_platform_participants: 0,
        },
        {
          id: "slot-full",
          activity_id: activityId,
          starts_at: "2026-04-08T10:00:00.000Z",
          ends_at: "2026-04-08T12:00:00.000Z",
          max_capacity: 5,
          off_platform_participants: 0,
        },
      ],
      { "slot-open": 3, "slot-full": 5 },
    );

    const rows = await listPublicSlotsForActivity(supabase as any, activityId, {
      now,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "slot-open",
      off_platform_participants: 0,
      booked_participants: 3,
      remaining_capacity: 7,
    });
  });

  it("uses injected now for starts_at lower bound", async () => {
    vi.mocked(getActivityById).mockResolvedValueOnce(publicActivity as any);
    const slotsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn(),
    };
    const supabase = {
      from: vi.fn((table: string) =>
        table === "availability_slots" ? slotsQuery : {},
      ),
      rpc: rpcSlotBookedMock({}),
    };
    slotsQuery.order = vi
      .fn()
      .mockResolvedValue({ data: [], error: null });

    const now = new Date("2026-05-01T00:00:00.000Z");
    await listPublicSlotsForActivity(supabase as any, activityId, { now });

    expect(slotsQuery.gt).toHaveBeenCalledWith("starts_at", now.toISOString());
  });

  it("throws when slot query fails", async () => {
    vi.mocked(getActivityById).mockResolvedValueOnce(publicActivity as any);
    const slotsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "db" } }),
    };
    const supabase = {
      from: vi.fn((table: string) =>
        table === "availability_slots" ? slotsQuery : {},
      ),
      rpc: rpcSlotBookedMock({}),
    };

    await expect(
      listPublicSlotsForActivity(supabase as any, activityId, {
        now: new Date("2026-04-06T12:00:00.000Z"),
      }),
    ).rejects.toThrow("Could not list availability slots: db");
  });
});

describe("listManageSlotsForActivity", () => {
  function makeManageMocks(opts: {
    activity: { id: string; vendor_id: string } | null;
    activityError?: { message: string };
    vendorId?: string | null;
    slots: unknown[];
    bookings?: Array<{ slot_id: string; participants: number }>;
  }) {
    const activitiesQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: opts.activity,
        error: opts.activityError ?? null,
      }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: opts.vendorId ? { id: opts.vendorId } : null,
        error: null,
      }),
    };
    const slotsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: opts.slots, error: null }),
    };
    const bookedBySlotId: Record<string, number> = {};
    for (const b of opts.bookings ?? []) {
      bookedBySlotId[b.slot_id] =
        (bookedBySlotId[b.slot_id] ?? 0) + b.participants;
    }

    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "activities") return activitiesQuery;
        if (table === "vendors") return vendorsQuery;
        if (table === "availability_slots") return slotsQuery;
        return {};
      }),
      rpc: rpcSlotBookedMock(bookedBySlotId),
    };

    return { supabase, activitiesQuery, vendorsQuery, slotsQuery };
  }

  it("throws Activity not found", async () => {
    const { supabase } = makeManageMocks({ activity: null, slots: [] });
    await expect(
      listManageSlotsForActivity(supabase as any, activityId),
    ).rejects.toThrow("Activity not found");
  });

  it("throws when vendor does not own activity", async () => {
    const { supabase } = makeManageMocks({
      activity: { id: activityId, vendor_id: "other-vendor" },
      vendorId,
      slots: [],
    });
    await expect(
      listManageSlotsForActivity(supabase as any, activityId),
    ).rejects.toThrow("Forbidden: You do not manage this activity.");
  });

  it("returns all slots with booked_participants for owning vendor", async () => {
    const slotRow = {
      id: "slot-1",
      activity_id: activityId,
      vendor_id: vendorId,
      starts_at: "2026-04-01T10:00:00.000Z",
      ends_at: "2026-04-01T12:00:00.000Z",
      max_capacity: 8,
      is_cancelled: true,
      created_at: "t0",
      updated_at: "t0",
    };
    const { supabase } = makeManageMocks({
      activity: { id: activityId, vendor_id: vendorId },
      vendorId,
      slots: [slotRow],
      bookings: [{ slot_id: "slot-1", participants: 4 }],
    });

    const rows = await listManageSlotsForActivity(supabase as any, activityId);
    expect(rows).toHaveLength(1);
    expect(rows[0].booked_participants).toBe(4);
    expect(rows[0].is_cancelled).toBe(true);
  });

  it("skips vendor check when isAdmin", async () => {
    const activitiesQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: activityId, vendor_id: "any" },
        error: null,
      }),
    };
    const slotsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "activities") return activitiesQuery;
        if (table === "availability_slots") return slotsQuery;
        return {};
      }),
      rpc: rpcSlotBookedMock({}),
    };

    await listManageSlotsForActivity(supabase as any, activityId, {
      isAdmin: true,
    });
    expect(supabase.from).not.toHaveBeenCalledWith("vendors");
  });
});

describe("createAvailabilitySlot", () => {
  it("computes ends_at and passes vendor_id from activity", async () => {
    const activitiesQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: activityId,
          vendor_id: vendorId,
          duration_hours: 1.5,
        },
        error: null,
      }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };
    const insertChain: Record<string, unknown> = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };
    const inserted = {
      id: "new-slot",
      activity_id: activityId,
      vendor_id: vendorId,
      starts_at: "2026-06-01T14:00:00.000Z",
      ends_at: computeEndsAtIso("2026-06-01T14:00:00.000Z", 1.5),
      max_capacity: 6,
      is_cancelled: false,
      created_at: "t0",
      updated_at: "t0",
    };
    insertChain.single = vi
      .fn()
      .mockResolvedValue({ data: inserted, error: null });

    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "activities") return activitiesQuery;
        if (table === "vendors") return vendorsQuery;
        return insertChain;
      }),
    };

    const row = await createAvailabilitySlot(
      supabase as any,
      activityId,
      { starts_at: "2026-06-01T14:00:00.000Z", max_capacity: 6 },
    );

    expect(insertChain.insert).toHaveBeenCalledWith({
      activity_id: activityId,
      vendor_id: vendorId,
      starts_at: "2026-06-01T14:00:00.000Z",
      ends_at: inserted.ends_at,
      max_capacity: 6,
    });
    expect(row).toEqual(inserted);
  });

  it("throws when duration_hours is null", async () => {
    const activitiesQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: activityId, vendor_id: vendorId, duration_hours: null },
        error: null,
      }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };
    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) =>
        table === "activities" ? activitiesQuery : vendorsQuery,
      ),
    };

    await expect(
      createAvailabilitySlot(supabase as any, activityId, {
        starts_at: "2026-06-01T14:00:00.000Z",
        max_capacity: 4,
      }),
    ).rejects.toThrow(
      "Activity duration_hours must be set and greater than zero to create or reschedule slots.",
    );
  });
});

describe("updateAvailabilitySlot", () => {
  const baseSlot = {
    id: "slot-1",
    activity_id: activityId,
    vendor_id: vendorId,
    starts_at: "2026-07-01T10:00:00.000Z",
    ends_at: "2026-07-01T12:00:00.000Z",
    max_capacity: 10,
    off_platform_participants: 0,
    is_cancelled: false,
    created_at: "t0",
    updated_at: "t0",
  };

  it("throws when max_capacity is below platform bookings plus off_platform", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };

    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "availability_slots") return loadQuery;
        if (table === "vendors") return vendorsQuery;
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 2 }),
    };

    await expect(
      updateAvailabilitySlot(supabase as any, activityId, "slot-1", {
        max_capacity: 1,
      }),
    ).rejects.toThrow(
      "max_capacity must be at least platform bookings plus off_platform_participants.",
    );
  });

  it("throws when rescheduling while platform bookings exist", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };

    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "availability_slots") return loadQuery;
        if (table === "vendors") return vendorsQuery;
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 2 }),
    };

    await expect(
      updateAvailabilitySlot(supabase as any, activityId, "slot-1", {
        starts_at: "2026-08-01T15:00:00.000Z",
      }),
    ).rejects.toThrow(
      "Cannot reschedule this slot while it has platform bookings (confirmed or pending approval).",
    );
  });

  it("updates when no confirmed bookings", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };

    const updateChain: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };
    const updated = { ...baseSlot, max_capacity: 12 };
    updateChain.single = vi
      .fn()
      .mockResolvedValue({ data: updated, error: null });

    let slotsCalls = 0;
    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "vendors") return vendorsQuery;
        if (table === "availability_slots") {
          slotsCalls += 1;
          return slotsCalls === 1 ? loadQuery : updateChain;
        }
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 0 }),
    };

    const row = await updateAvailabilitySlot(
      supabase as any,
      activityId,
      "slot-1",
      { max_capacity: 12 },
    );
    expect(row.max_capacity).toBe(12);
    expect(updateChain.update).toHaveBeenCalledWith({ max_capacity: 12 });
  });

  it("recomputes ends_at when only starts_at changes", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };

    const activitiesDurationQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { duration_hours: 2 },
        error: null,
      }),
    };

    const updateChain: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };
    const newStart = "2026-08-01T15:00:00.000Z";
    const newEnd = computeEndsAtIso(newStart, 2);
    const updated = {
      ...baseSlot,
      starts_at: newStart,
      ends_at: newEnd,
    };
    updateChain.single = vi
      .fn()
      .mockResolvedValue({ data: updated, error: null });

    let slotsCalls = 0;
    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "vendors") return vendorsQuery;
        if (table === "activities") return activitiesDurationQuery;
        if (table === "availability_slots") {
          slotsCalls += 1;
          return slotsCalls === 1 ? loadQuery : updateChain;
        }
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 0 }),
    };

    const row = await updateAvailabilitySlot(
      supabase as any,
      activityId,
      "slot-1",
      { starts_at: newStart },
    );
    expect(row.starts_at).toBe(newStart);
    expect(row.ends_at).toBe(newEnd);
    expect(updateChain.update).toHaveBeenCalledWith({
      starts_at: newStart,
      ends_at: newEnd,
    });
  });

  it("throws when rescheduling but activity duration_hours is null", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };
    const activitiesDurationQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { duration_hours: null },
        error: null,
      }),
    };

    const updateChain: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };
    let slotsCalls = 0;
    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "vendors") return vendorsQuery;
        if (table === "activities") return activitiesDurationQuery;
        if (table === "availability_slots") {
          slotsCalls += 1;
          return slotsCalls === 1 ? loadQuery : updateChain;
        }
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 0 }),
    };

    await expect(
      updateAvailabilitySlot(supabase as any, activityId, "slot-1", {
        starts_at: "2026-08-01T15:00:00.000Z",
      }),
    ).rejects.toThrow(
      "Activity duration_hours must be set and greater than zero to create or reschedule slots.",
    );
    expect(updateChain.update).not.toHaveBeenCalled();
  });

  it("throws Activity not found when loading duration for reschedule", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };
    const activitiesDurationQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    let slotsCalls = 0;
    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "vendors") return vendorsQuery;
        if (table === "activities") return activitiesDurationQuery;
        if (table === "availability_slots") {
          slotsCalls += 1;
          return slotsCalls === 1 ? loadQuery : {};
        }
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 0 }),
    };

    await expect(
      updateAvailabilitySlot(supabase as any, activityId, "slot-1", {
        starts_at: "2026-08-01T15:00:00.000Z",
      }),
    ).rejects.toThrow("Activity not found");
  });

  it("throws prefixed error when activity duration query fails", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };
    const activitiesDurationQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "rls blocked" },
      }),
    };

    let slotsCalls = 0;
    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "vendors") return vendorsQuery;
        if (table === "activities") return activitiesDurationQuery;
        if (table === "availability_slots") {
          slotsCalls += 1;
          return slotsCalls === 1 ? loadQuery : {};
        }
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 0 }),
    };

    await expect(
      updateAvailabilitySlot(supabase as any, activityId, "slot-1", {
        starts_at: "2026-08-01T15:00:00.000Z",
      }),
    ).rejects.toThrow(
      "Could not load activity duration for slot reschedule: rls blocked",
    );
  });
});

describe("cancelAvailabilitySlot", () => {
  const baseSlot = {
    id: "slot-1",
    activity_id: activityId,
    vendor_id: vendorId,
    starts_at: "2026-07-01T10:00:00.000Z",
    ends_at: "2026-07-01T12:00:00.000Z",
    max_capacity: 10,
    off_platform_participants: 0,
    is_cancelled: false,
    created_at: "t0",
    updated_at: "t0",
  };

  it("throws when platform bookings exist", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };

    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "availability_slots") return loadQuery;
        if (table === "vendors") return vendorsQuery;
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 1 }),
    };

    await expect(
      cancelAvailabilitySlot(supabase as any, activityId, "slot-1"),
    ).rejects.toThrow(
      "Cannot cancel this slot while it has platform bookings (confirmed or pending approval).",
    );
  });

  it("sets is_cancelled when no platform bookings", async () => {
    const loadQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: baseSlot, error: null }),
    };
    const vendorsQuery: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: vendorId },
        error: null,
      }),
    };

    const cancelChain: Record<string, unknown> = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };
    const cancelled = { ...baseSlot, is_cancelled: true };
    cancelChain.single = vi
      .fn()
      .mockResolvedValue({ data: cancelled, error: null });

    let slotsCalls = 0;
    const supabase = {
      ...authAndVendorSupabase(),
      from: vi.fn((table: string) => {
        if (table === "vendors") return vendorsQuery;
        if (table === "availability_slots") {
          slotsCalls += 1;
          return slotsCalls === 1 ? loadQuery : cancelChain;
        }
        return {};
      }),
      rpc: rpcSlotBookedMock({ "slot-1": 0 }),
    };

    const row = await cancelAvailabilitySlot(
      supabase as any,
      activityId,
      "slot-1",
    );
    expect(row.is_cancelled).toBe(true);
    expect(cancelChain.update).toHaveBeenCalledWith({ is_cancelled: true });
  });
});
