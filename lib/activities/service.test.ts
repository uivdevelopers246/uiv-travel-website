import { describe, it, expect, vi } from "vitest";
import { createActivity, listActivities, getActivityById } from "./service";

function makeMockSupabase() {
    const query: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        maybeSingle: vi.fn(),
        then: undefined,
    };

    const supabase: any = {
        from: vi.fn(() => query),
        auth: {
          getUser: vi.fn()
        }
    };

    return { supabase, query }
}

function makeMockSupabaseForCreateActivity() {
  const activitiesQuery: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(),
  };

  const vendorsQuery: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
  };

  const supabase: any = {
      from: vi.fn((table: string) => (table === "vendors" ? vendorsQuery : activitiesQuery)),
      auth: {
          getUser: vi.fn().mockResolvedValue({
              data: { user: { id: "user-1" } },
              error: null,
          }),
      },
  };

  return { supabase, activitiesQuery, vendorsQuery };
}

describe("activities service", () => {
  //----------------CREATE------------------
  it("createActivity: inserts a new activity and returns the created row", async () => {
    const { supabase, activitiesQuery, vendorsQuery } = makeMockSupabaseForCreateActivity();
  
    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });
    
    activitiesQuery.single.mockResolvedValueOnce({
      data: {
        id: "a1",
        vendor_id: "v1",
        title: "Snorkeling Tour",
        description: null,
        location: "Bridgetown",
        category: "water-sports",
        duration_hours: 2,
        price_per_person: 120,
        max_capacity: 10,
        rating: null,
        image_url: null,
        is_featured: false,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    });
    
    const created = await createActivity(supabase, {
      title: "Snorkeling Tour",
      category: "water-sports",
      location: "Bridgetown",
      duration_hours: 2,
      price_per_person: 120,
      max_capacity: 10,
    });
    
    expect(supabase.auth.getUser).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith("vendors");
    expect(vendorsQuery.eq).toHaveBeenCalledWith("owner_user_id", "user-1");
    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(activitiesQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "v1",
        title: "Snorkeling Tour",
        category: "water-sports",
        location: "Bridgetown",
        duration_hours: 2,
        price_per_person: 120,
        max_capacity: 10,
      })
    );
    expect(created.id).toBe("a1");
    expect(created.vendor_id).toBe("v1");
  });



  it("createActivity: throws when insert fails", async () => {
    const { supabase, activitiesQuery, vendorsQuery } = makeMockSupabaseForCreateActivity();
  
    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });
  
    activitiesQuery.single.mockResolvedValueOnce({
      data: null,
      error: { message: "Insert failed" },
    });

    await expect(
      createActivity(supabase, {
        title: "Bad Activity",
        category: "water-sports",
      })
    ).rejects.toThrow("Insert failed");
  
    expect(supabase.from).toHaveBeenCalledWith("vendors");
    expect(supabase.from).toHaveBeenCalledWith("activities");
  });

  
  it("createActivity: throws when user is not signed in", async () => {
    const { supabase, vendorsQuery } = makeMockSupabaseForCreateActivity();
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(
        createActivity(supabase, {
            title: "Snorkeling Tour",
            category: "water-sports",
        })
    ).rejects.toThrow("Unauthorized");

    expect(supabase.auth.getUser).toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
});

it("createActivity: throws when user has no vendor", async () => {
  const { supabase, vendorsQuery } = makeMockSupabaseForCreateActivity();
  vendorsQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

  await expect(
      createActivity(supabase, {
          title: "Snorkeling Tour",
          category: "water-sports",
      })
  ).rejects.toThrow("User is not associated with a vendor");

  expect(supabase.from).toHaveBeenCalledWith("vendors");
  expect(supabase.from).not.toHaveBeenCalledWith("activities");
});
  
  //-----------------READ---------------

  it("listActivities: builds query with filters and returns data", async () => {
      const { supabase, query} = makeMockSupabase();

      query.range.mockResolvedValueOnce({
          data: [{ id: "a1", title: "test", vendor: "v1", status: "published"}],
          error: null,
      });

      const res = await listActivities(supabase, {
          vendorId: "v1",
          status: "published",
          limit: 10,
          offset: 0,
          featuredOnly: true,
      });

      expect(supabase.from).toHaveBeenCalledWith("activities");
      expect(query.select).toHaveBeenCalled();
      expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false});
      expect(query.eq).toHaveBeenCalledWith("status", "published");
      expect(query.eq).toHaveBeenCalledWith("vendor_id", "v1");
      expect(query.eq).toHaveBeenCalledWith("is_featured", true);
      expect(query.range).toHaveBeenCalledWith(0, 9);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("a1");
  })

  it("getActivityById: returns activity when found", async () => {
      const { supabase, query } = makeMockSupabase();
  
      query.single.mockResolvedValueOnce({
        data: { id: "a1", title: "Found", vendor_id: "v1", status: "draft" },
        error: null,
      });
  
      const res = await getActivityById(supabase, "a1");
  
      expect(supabase.from).toHaveBeenCalledWith("activities");
      expect(query.eq).toHaveBeenCalledWith("id", "a1");
      expect(query.single).toHaveBeenCalled();
      expect(res?.id).toBe("a1");
    });

    it("getActivityById: returns null when not found", async () => {
      const { supabase, query } = makeMockSupabase();
  
      query.single.mockResolvedValueOnce({
        data: null,
        error: { message: "No rows" },
      });
  
      const res = await getActivityById(supabase, "missing");
      expect(res).toBeNull();
    });
})
