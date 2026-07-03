import { beforeEach, describe, expect, it, vi } from "vitest";

const digestMocks = vi.hoisted(() => ({
  createProviderDailyDigestNotifications: vi.fn(),
}));

const workerMocks = vi.hoisted(() => ({
  processQueuedNotificationEmails: vi.fn(),
}));

const serviceRoleMocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/notifications/digest", () => digestMocks);
vi.mock("@/lib/notifications/email-worker", () => workerMocks);
vi.mock("@/lib/supabase/service-role", () => serviceRoleMocks);

import { GET } from "./route";

function makeRequest(auth?: string) {
  return new Request("http://localhost:3000/api/cron/notifications", {
    method: "GET",
    headers: auth ? { authorization: auth } : undefined,
  });
}

describe("GET /api/cron/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    serviceRoleMocks.createServiceRoleClient.mockReturnValue({ service: true });
    digestMocks.createProviderDailyDigestNotifications.mockResolvedValue({
      created: 1,
      skipped: 0,
    });
    workerMocks.processQueuedNotificationEmails.mockResolvedValue({
      processed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(serviceRoleMocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("creates digest notifications and drains queued email", async () => {
    const response = await GET(makeRequest("Bearer cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      digest: { created: 1, skipped: 0 },
      email: { processed: 1, sent: 1, skipped: 0, failed: 0 },
    });
    expect(digestMocks.createProviderDailyDigestNotifications).toHaveBeenCalledWith({
      service: true,
    });
    expect(workerMocks.processQueuedNotificationEmails).toHaveBeenCalledWith(
      { service: true },
      { limit: 100 },
    );
  });
});
