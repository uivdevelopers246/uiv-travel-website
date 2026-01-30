import { describe, it, expect, vi } from "vitest";
import { listActivities, getActivityById } from "./service";

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
})
