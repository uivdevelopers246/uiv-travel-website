import { beforeEach, describe, expect, it, vi } from "vitest";

const workerMocks = vi.hoisted(() => ({
  processQueuedNotificationEmails: vi.fn(),
}));

const serviceRoleMocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/notifications/email-worker", () => workerMocks);
vi.mock("@/lib/supabase/service-role", () => serviceRoleMocks);

import { POST } from "./route";

function makeRequest(auth?: string) {
  return new Request("http://localhost:3000/api/cron/notifications", {
    method: "POST",
    headers: auth ? { authorization: auth } : undefined,
  });
}

describe("POST /api/cron/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    serviceRoleMocks.createServiceRoleClient.mockReturnValue({ service: true });
    workerMocks.processQueuedNotificationEmails.mockResolvedValue({
      processed: 1,
      sent: 1,
      skipped: 0,
      retried: 0,
      failed: 0,
      exhausted: 0,
    });
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(serviceRoleMocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fails closed when the cron secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(serviceRoleMocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("drains queued email", async () => {
    const response = await POST(makeRequest("Bearer cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      email: {
        processed: 1,
        sent: 1,
        skipped: 0,
        retried: 0,
        failed: 0,
        exhausted: 0,
      },
    });
    expect(workerMocks.processQueuedNotificationEmails).toHaveBeenCalledWith(
      { service: true },
      { limit: 100 },
    );
  });
});
