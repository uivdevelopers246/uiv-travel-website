import { describe, it, expect, vi } from "vitest";
import { createActivity, listActivities, updateActivity, deleteActivity, getActivityById } from "./service";

vi.mock("@/lib/geocode/service", () => ({
  geocodeAddress: vi.fn().mockResolvedValue(null),
}));

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
      rpc: vi.fn().mockResolvedValue({ data: null, error: null}),
  };

  return { supabase, activitiesQuery, vendorsQuery };
}

function makeMockSupabaseForUpdateDelete() {
  const activitiesQuery: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
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
    rpc: vi.fn().mockResolvedValue({ data: null, error: null}),
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
    
    const createdRow = {
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
    };
    activitiesQuery.single.mockResolvedValueOnce(createdRow).mockResolvedValueOnce(createdRow);
    
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

  it("listActivities: builds query for published activities and returns data", async () => {
    const { supabase, query } = makeMockSupabase();

    query.range.mockResolvedValueOnce({
      data: [
        {
          id: "a1",
          vendor_id: "v1",
          title: "Snorkeling",
          status: "published",
          category: "water-sports",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      error: null,
    });

    const res = await listActivities(supabase, { limit: 10, offset: 0 });

    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(query.select).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.range).toHaveBeenCalledWith(0, 9);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: "a1",
      vendor_id: "v1",
      title: "Snorkeling",
      status: "published",
    });
  });

  it("listActivities: returns empty array when no activities", async () => {
    const { supabase, query } = makeMockSupabase();

    query.range.mockResolvedValueOnce({ data: [], error: null });

    const res = await listActivities(supabase, { limit: 10, offset: 0 });

    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.range).toHaveBeenCalledWith(0, 9);
    expect(res).toHaveLength(0);
  });

  it("listActivities: throws when query fails", async () => {
    const { supabase, query } = makeMockSupabase();

    query.range.mockResolvedValueOnce({
      data: null,
      error: { message: "Connection error" },
    });

    await expect(
      listActivities(supabase, { limit: 10, offset: 0 })
    ).rejects.toThrow("Connection error");

    expect(supabase.from).toHaveBeenCalledWith("activities");
  });

  it("listActivities: applies correct range for pagination", async () => {
    const { supabase, query } = makeMockSupabase();

    query.range.mockResolvedValueOnce({
      data: [{ id: "a11", vendor_id: "v1", title: "Page 2", status: "published" }],
      error: null,
    });

    const res = await listActivities(supabase, { limit: 10, offset: 10 });

    expect(query.range).toHaveBeenCalledWith(10, 19);
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("a11");
  });

  it("listActivities: returns multiple activities", async () => {
    const { supabase, query } = makeMockSupabase();

    query.range.mockResolvedValueOnce({
      data: [
        { id: "a1", vendor_id: "v1", title: "First", status: "published" },
        { id: "a2", vendor_id: "v1", title: "Second", status: "published" },
      ],
      error: null,
    });

    const res = await listActivities(supabase, { limit: 10, offset: 0 });

    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ id: "a1", title: "First" });
    expect(res[1]).toMatchObject({ id: "a2", title: "Second" });
  });

  it("getActivityById: returns activity when found", async () => {
    const { supabase, query } = makeMockSupabase();

    const mockActivity = {
      id: "a1",
      vendor_id: "v1",
      title: "Snorkeling Tour",
      description: "Amazing underwater experience",
      location: "Bridgetown",
      category: "water-sports",
      duration_hours: 2,
      price_per_person: 120,
      max_capacity: 10,
      rating: 4.5,
      image_url: "https://example.com/image.jpg",
      is_featured: true,
    };

    query.maybeSingle.mockResolvedValueOnce({
      data: mockActivity,
      error: null,
    });

    const result = await getActivityById(supabase, "a1");

    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(query.select).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("id", "a1");
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.maybeSingle).toHaveBeenCalled();
    expect(result).toMatchObject(mockActivity);
    expect(result?.id).toBe("a1");
    expect(result?.title).toBe("Snorkeling Tour");
  });

  it("getActivityById: returns null when activity not found", async () => {
    const { supabase, query } = makeMockSupabase();

    query.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await getActivityById(supabase, "nonexistent-id");

    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(query.eq).toHaveBeenCalledWith("id", "nonexistent-id");
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(result).toBeNull();
  });

  it("getActivityById: throws when query fails", async () => {
    const { supabase, query } = makeMockSupabase();

    query.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "Connection error" },
    });

    await expect(
      getActivityById(supabase, "a1")
    ).rejects.toThrow("Connection error");

    expect(supabase.from).toHaveBeenCalledWith("activities");
  });

  it("getActivityById: only returns published activities", async () => {
    const { supabase, query } = makeMockSupabase();

    query.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "a1",
        vendor_id: "v1",
        title: "Published Activity",
        status: "published",
        category: "water-sports",
      },
      error: null,
    });

    await getActivityById(supabase, "a1");

    expect(query.eq).toHaveBeenCalledWith("status", "published");
  });


  //-----------------UPDATE---------------
  it("updateActivity: updates an activity by id and returns the updated row", async () => {
    const { supabase, activitiesQuery, vendorsQuery } = makeMockSupabaseForUpdateDelete();

    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });

    const updateRow = {
      data: {
        id: "a1",
        vendor_id: "v1",
        title: "Updated Title",
        description: "Updated description",
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
    }


    // We now call this twice because updateActivity makes two calls now. One before and after the geocoding
    activitiesQuery.single.mockResolvedValueOnce(updateRow).mockResolvedValueOnce(updateRow);

    const updated = await updateActivity(supabase, "a1", {
      title: "Updated Title",
      description: "Updated description",
    });

    expect(supabase.auth.getUser).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith("vendors");
    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(activitiesQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Updated Title",
        description: "Updated description",
      })
    );
    expect(activitiesQuery.eq).toHaveBeenCalledWith("id", "a1");
    expect(updated.id).toBe("a1");
    expect(updated.title).toBe("Updated Title");
    expect(updated.description).toBe("Updated description");
  });


  it("updateActivity: throws when update fails", async () => {
    const { supabase, activitiesQuery, vendorsQuery } = makeMockSupabaseForUpdateDelete();

    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });

    activitiesQuery.single.mockResolvedValueOnce({
      data: null,
      error: { message: "Update failed" },
    });

    await expect(
      updateActivity(supabase, "a1", { title: "New Title" })
    ).rejects.toThrow("Update failed");

    expect(supabase.from).toHaveBeenCalledWith("vendors");
    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(activitiesQuery.update).toHaveBeenCalled();
  });


  it("updateActivity: throws when user is not signed in", async () => {
    const { supabase, vendorsQuery } = makeMockSupabaseForUpdateDelete();
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(
      updateActivity(supabase, "a1", { title: "New Title" })
    ).rejects.toThrow("Unauthorized");
  });

  it("updateActivity: throws when user has no vendor", async () => {
    const { supabase, vendorsQuery } = makeMockSupabaseForUpdateDelete();
    vendorsQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      updateActivity(supabase, "a1", { title: "New Title" })
    ).rejects.toThrow("User is not associated with a vendor");

    expect(supabase.from).toHaveBeenCalledWith("vendors");
    expect(supabase.from).not.toHaveBeenCalledWith("activities");
  });

  it("updateActivity: throws when activity is not found", async () => {
    const { supabase, activitiesQuery, vendorsQuery } = makeMockSupabaseForUpdateDelete();

    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });

    activitiesQuery.single.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "Row not found" },
    });

    await expect(
      updateActivity(supabase, "nonexistent-id", { title: "New Title" })
    ).rejects.toThrow("Row not found");

    expect(activitiesQuery.update).toHaveBeenCalled();
    expect(activitiesQuery.eq).toHaveBeenCalledWith("id", "nonexistent-id");
  });

  //-----------------DELETE---------------
  it("deleteActivity: deletes an activity by id and returns the deleted row", async () => {
    const { supabase, activitiesQuery, vendorsQuery } = makeMockSupabaseForUpdateDelete();
  
    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });
  
    const deletedRow = {
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
    };
  
    activitiesQuery.single.mockResolvedValueOnce({
      data: deletedRow,
      error: null,
    });
  
    const result = await deleteActivity(supabase, "a1");
  
    expect(supabase.auth.getUser).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith("vendors");
    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(activitiesQuery.delete).toHaveBeenCalled();
    expect(activitiesQuery.eq).toHaveBeenCalledWith("id", "a1");
    expect(result).toEqual(deletedRow);
    expect(result?.id).toBe("a1");
  });

  it("deleteActivity: throws when delete fails", async () => {
    const { supabase, activitiesQuery, vendorsQuery } = makeMockSupabaseForUpdateDelete();

    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });

    activitiesQuery.single.mockResolvedValueOnce({
      data: null,
      error: { message: "Delete failed" },
    });

    await expect(deleteActivity(supabase, "a1")).rejects.toThrow("Delete failed");

    expect(supabase.from).toHaveBeenCalledWith("activities");
    expect(activitiesQuery.delete).toHaveBeenCalled();
  });

  it("deleteActivity: throws when user is not signed in", async () => {
    const { supabase } = makeMockSupabaseForUpdateDelete();
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(deleteActivity(supabase, "a1")).rejects.toThrow("Unauthorized");

    expect(supabase.auth.getUser).toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("deleteActivity: throws when user has no vendor", async () => {
    const { supabase, vendorsQuery } = makeMockSupabaseForUpdateDelete();
    vendorsQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(deleteActivity(supabase, "a1")).rejects.toThrow(
      "User is not associated with a vendor"
    );

    expect(supabase.from).toHaveBeenCalledWith("vendors");
    expect(supabase.from).not.toHaveBeenCalledWith("activities");
  });

  it("deleteActivity: throws when activity is not found", async () => {
    const { supabase, activitiesQuery, vendorsQuery } = makeMockSupabaseForUpdateDelete();

    vendorsQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "v1" },
      error: null,
    });

    activitiesQuery.single.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "Row not found" },
    });

    await expect(deleteActivity(supabase, "nonexistent-id")).rejects.toThrow("Row not found");

    expect(activitiesQuery.delete).toHaveBeenCalled();
    expect(activitiesQuery.eq).toHaveBeenCalledWith("id", "nonexistent-id");
  });
  

})
