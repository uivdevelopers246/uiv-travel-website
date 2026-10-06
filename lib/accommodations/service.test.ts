import { describe, it, expect, vi } from "vitest";
import {
  createAccommodation,
  getAccommodationById,
  listAccommodations,
} from "./service";

function makeMockSupabase() {
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };

  const supabase = {
    from: vi.fn(() => query),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    auth: {
      getUser: vi.fn(),
    },
  };

  return { supabase, query };
}

function makeMockSupabaseForCreateAccommodation() {
  const accommodationsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };

  const vendorsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };

  const supabase = {
    from: vi.fn((table: string) =>
      table === "vendors" ? vendorsQuery : accommodationsQuery,
    ),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return { supabase, accommodationsQuery, vendorsQuery };
}

function minimalAccommodationRow(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: "acc1",
    vendor_id: "v1",
    name: "Ocean Villa",
    accommodation_type: "Villa",
    bedroom_count: null,
    bed_count: null,
    bathroom_count: null,
    max_guest_capacity: null,
    price_min_usd: null,
    price_max_usd: null,
    check_in_time: null,
    check_out_time: null,
    suitable_for_children: false,
    wheelchair_accessible: false,
    smoking_allowed: false,
    pets_allowed: false,
    beach_access_or_view: false,
    transportation_provided: false,
    amenities_complete: false,
    amenities: [],
    address: null,
    parish: null,
    transportation_notes: null,
    pickup_notes: null,
    image_url: null,
    is_featured: false,
    status: "draft",
    location_point: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("accommodations service", () => {
  it("createAccommodation: inserts with resolved vendor_id and returns the created row", async () => {
    const { supabase, accommodationsQuery, vendorsQuery } =
      makeMockSupabaseForCreateAccommodation();

    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });

    const createdRow = minimalAccommodationRow();
    accommodationsQuery.single
      .mockResolvedValueOnce({ data: createdRow, error: null })
      .mockResolvedValueOnce({ data: createdRow, error: null });

    const created = await createAccommodation(supabase as never, {
      name: "Ocean Villa",
      accommodation_type: "Villa",
    });

    expect(supabase.auth.getUser).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith("vendors");
    expect(vendorsQuery.eq).toHaveBeenCalledWith("owner_user_id", "user-1");
    expect(supabase.from).toHaveBeenCalledWith("accommodations");
    expect(accommodationsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "v1",
        name: "Ocean Villa",
        accommodation_type: "Villa",
      }),
    );
    expect(created.id).toBe("acc1");
    expect(created.vendor_id).toBe("v1");
    expect(supabase.rpc).toHaveBeenCalledWith("accommodation_bookable_price_ranges", { p_accommodation_ids: ["acc1"] });
    expect(created.price_min_usd).toBeNull();
    expect(created.price_max_usd).toBeNull();
  });

  it("createAccommodation: calls set_accommodation_location_point when latitude and longitude are provided", async () => {
    const { supabase, accommodationsQuery, vendorsQuery } =
      makeMockSupabaseForCreateAccommodation();

    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });

    const createdRow = minimalAccommodationRow();
    accommodationsQuery.single
      .mockResolvedValueOnce({ data: createdRow, error: null })
      .mockResolvedValueOnce({ data: createdRow, error: null });

    await createAccommodation(supabase as never, {
      name: "Beach House",
      accommodation_type: "Hotel",
      latitude: 13.1,
      longitude: -59.6,
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "set_accommodation_location_point",
      {
        p_accommodation_id: "acc1",
        p_lng: -59.6,
        p_lat: 13.1,
      },
    );
  });

  it("getAccommodationById: returns null when no published row matches", async () => {
    const { supabase, query } = makeMockSupabase();

    query.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await getAccommodationById(supabase as never, "nonexistent-id");

    expect(supabase.from).toHaveBeenCalledWith("accommodations");
    expect(query.eq).toHaveBeenCalledWith("id", "nonexistent-id");
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(result).toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("getAccommodationById replaces historical manual prices with the current bookable range", async () => {
    const { supabase, query } = makeMockSupabase();
    query.maybeSingle.mockResolvedValue({ data: minimalAccommodationRow({ price_min_usd: 1, price_max_usd: 999 }), error: null });
    supabase.rpc.mockResolvedValue({ data: [{ accommodation_id: "acc1", price_min_usd: 100, price_max_usd: 150 }], error: null });
    const result = await getAccommodationById(supabase as never, "acc1");
    expect(result).toMatchObject({ price_min_usd: 100, price_max_usd: 150 });
  });

  it("listAccommodations uses one batch query and clears old prices for listings with no available nights", async () => {
    const { supabase, query } = makeMockSupabase();
    query.range.mockResolvedValue({ data: [minimalAccommodationRow({ price_min_usd: 1 }), minimalAccommodationRow({ id: "acc2", price_min_usd: 99 })], error: null });
    supabase.rpc.mockResolvedValue({ data: [{ accommodation_id: "acc1", price_min_usd: 125, price_max_usd: 125 }], error: null });
    const result = await listAccommodations(supabase as never);
    expect(result.map(({ id, price_min_usd, price_max_usd }) => ({ id, price_min_usd, price_max_usd }))).toEqual([
      { id: "acc1", price_min_usd: 125, price_max_usd: 125 },
      { id: "acc2", price_min_usd: null, price_max_usd: null },
    ]);
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith("accommodation_bookable_price_ranges", { p_accommodation_ids: ["acc1", "acc2"] });
  });
});
