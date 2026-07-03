import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: routeMocks.createClient,
}));

import { PATCH } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/account/notification-preferences", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

describe("notification preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated updates", async () => {
    routeMocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const response = await PATCH(
      makeRequest({ email_enabled: true, daily_digest_enabled: true }),
    );

    expect(response.status).toBe(401);
  });

  it("upserts preferences only for the current user", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        user_id: "user-1",
        email_enabled: false,
        daily_digest_enabled: true,
        booking_updates_enabled: true,
        provider_updates_enabled: true,
        email_suppressed_at: null,
        email_suppressed_reason: null,
        email_suppressed_address: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    routeMocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: vi.fn(() => ({ upsert })),
    });

    const response = await PATCH(
      makeRequest({ email_enabled: false, daily_digest_enabled: true }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        email_enabled: false,
        daily_digest_enabled: true,
      },
      { onConflict: "user_id" },
    );
    expect(body).toMatchObject({
      email_enabled: false,
      daily_digest_enabled: true,
    });
  });
});
