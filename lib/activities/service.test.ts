import { describe, it, expect, vi } from "vitest";
import { createActivity, listActivities, getActivityById } from "./service";

function makeMockSupabase() {
    const query: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        then: undefined,
    };

    const supabase: any = {
        from: vi.fn(() => query),
    };

    return { supabase, query }
}

describe("activities service", () => {
    it("createActivity: inserts a new activity and returns the created row", async () => {
        const { supabase, query } = makeMockSupabase();
      
        // Extend the mock query builder to support insert() for this test
        (query as any).insert = vi.fn().mockReturnThis();
        // select() already exists in makeMockSupabase and returns this
        // single() exists too — we just need to define what it resolves to
      
        query.single.mockResolvedValueOnce({
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
          vendor_id: "v1",
          title: "Snorkeling Tour",
          category: "water-sports",
          location: "Bridgetown",
          duration_hours: 2,
          price_per_person: 120,
          max_capacity: 10,
          // note: rating intentionally omitted
        });
      
        expect(supabase.from).toHaveBeenCalledWith("activities");
        expect((query as any).insert).toHaveBeenCalledWith(
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
        expect(query.select).toHaveBeenCalled();
        expect(query.single).toHaveBeenCalled();
      
        expect(created.id).toBe("a1");
        expect(created.vendor_id).toBe("v1");
    });


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
