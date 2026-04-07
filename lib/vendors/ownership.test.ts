import { describe, it, expect, vi } from "vitest";
import {
  getCurrentUserIdOrThrow,
  getVendorIdForCurrentUser,
} from "./ownership";

describe("getCurrentUserIdOrThrow", () => {
  it("throws Unauthorized when there is no session user", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any;

    await expect(getCurrentUserIdOrThrow(supabase)).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("returns the authenticated user id", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-abc" } },
          error: null,
        }),
      },
    } as any;

    await expect(getCurrentUserIdOrThrow(supabase)).resolves.toBe("user-abc");
  });
});

describe("getVendorIdForCurrentUser", () => {
  function vendorsChain(result: {
    data: { id: string } | null;
    error: { message: string } | null;
  }) {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(result),
    };
    return query;
  }

  it("throws Unauthorized when forUserId is omitted and there is no session user", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      from: vi.fn(),
    } as any;

    await expect(getVendorIdForCurrentUser(supabase)).rejects.toThrow(
      "Unauthorized",
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("loads vendor for the authenticated user when forUserId is omitted", async () => {
    const vendorsQuery = vendorsChain({
      data: { id: "vendor-1" },
      error: null,
    });
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-1" } },
          error: null,
        }),
      },
      from: vi.fn(() => vendorsQuery),
    } as any;

    const id = await getVendorIdForCurrentUser(supabase);
    expect(id).toBe("vendor-1");
    expect(vendorsQuery.eq).toHaveBeenCalledWith("owner_user_id", "owner-1");
  });

  it("uses forUserId and does not rely on auth.getUser for the vendor lookup", async () => {
    const vendorsQuery = vendorsChain({
      data: { id: "vendor-2" },
      error: null,
    });
    const getUser = vi.fn();
    const supabase = {
      auth: { getUser },
      from: vi.fn(() => vendorsQuery),
    } as any;

    const id = await getVendorIdForCurrentUser(supabase, "explicit-user");
    expect(id).toBe("vendor-2");
    expect(getUser).not.toHaveBeenCalled();
    expect(vendorsQuery.eq).toHaveBeenCalledWith(
      "owner_user_id",
      "explicit-user",
    );
  });

  it("throws when the user has no vendor row", async () => {
    const vendorsQuery = vendorsChain({ data: null, error: null });
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1" } },
          error: null,
        }),
      },
      from: vi.fn(() => vendorsQuery),
    } as any;

    await expect(getVendorIdForCurrentUser(supabase)).rejects.toThrow(
      "User is not associated with a vendor",
    );
  });

  it("throws vendor query error message", async () => {
    const vendorsQuery = vendorsChain({
      data: null,
      error: { message: "database unavailable" },
    });
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1" } },
          error: null,
        }),
      },
      from: vi.fn(() => vendorsQuery),
    } as any;

    await expect(getVendorIdForCurrentUser(supabase)).rejects.toThrow(
      "database unavailable",
    );
  });
});
