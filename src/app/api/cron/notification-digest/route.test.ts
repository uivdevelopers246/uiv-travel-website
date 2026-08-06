import { beforeEach, describe, expect, it, vi } from "vitest";

const digestMocks = vi.hoisted(() => ({
  createProviderDailyDigestNotifications: vi.fn(),
}));
const serviceRoleMocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/notifications/digest", () => digestMocks);
vi.mock("@/lib/supabase/service-role", () => serviceRoleMocks);

import { GET } from "./route";

function makeRequest(auth?: string) {
  return new Request("http://localhost:3000/api/cron/notification-digest", {
    headers: auth ? { authorization: auth } : undefined,
  });
}

describe("GET /api/cron/notification-digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    serviceRoleMocks.createServiceRoleClient.mockReturnValue({ service: true });
    digestMocks.createProviderDailyDigestNotifications.mockResolvedValue({
      created: 1,
      skipped: 2,
    });
  });

  it("rejects an invalid bearer token", async () => {
    const response = await GET(makeRequest("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(serviceRoleMocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fails closed when the cron secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(makeRequest());

    expect(response.status).toBe(503);
    expect(serviceRoleMocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("creates the daily digest without draining email", async () => {
    const response = await GET(makeRequest("Bearer cron-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      digest: { created: 1, skipped: 2 },
    });
    expect(digestMocks.createProviderDailyDigestNotifications).toHaveBeenCalledWith({
      service: true,
    });
  });
});
