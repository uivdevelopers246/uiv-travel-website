import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationMocks = vi.hoisted(() => ({
  parseResendWebhookPayload: vi.fn(),
  processResendWebhookFeedback: vi.fn(),
  verifyResendWebhookSignature: vi.fn(),
}));

const serviceRoleMocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  serverError: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 500 }),
  ),
}));

vi.mock("@/lib/notifications/resend-feedback", () => notificationMocks);
vi.mock("@/lib/supabase/service-role", () => serviceRoleMocks);
vi.mock("@/api-shared/route-helpers", () => routeHelperMocks);

import { POST } from "./route";

function makeRequest(body: string) {
  return new Request("http://localhost:3000/api/webhooks/resend/events", {
    method: "POST",
    headers: {
      "svix-id": "msg_123",
      "svix-timestamp": "1760000000",
      "svix-signature": "v1,sig",
    },
    body,
  });
}

describe("POST /api/webhooks/resend/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceRoleMocks.createServiceRoleClient.mockReturnValue({ service: true });
    notificationMocks.parseResendWebhookPayload.mockReturnValue({
      type: "email.delivered",
      data: { email_id: "resend-email-1" },
    });
    notificationMocks.processResendWebhookFeedback.mockResolvedValue({
      status: "processed",
      eventType: "delivery",
      suppressed: false,
    });
  });

  it("verifies the raw body before processing the webhook", async () => {
    const rawBody = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "resend-email-1" },
    });

    const response = await POST(makeRequest(rawBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      received: true,
      result: {
        status: "processed",
        eventType: "delivery",
        suppressed: false,
      },
    });
    expect(notificationMocks.verifyResendWebhookSignature).toHaveBeenCalledWith(
      rawBody,
      expect.any(Headers),
    );
    expect(notificationMocks.processResendWebhookFeedback).toHaveBeenCalledWith(
      { service: true },
      {
        type: "email.delivered",
        data: { email_id: "resend-email-1" },
      },
    );
  });

  it("rejects invalid signatures before creating a service-role client", async () => {
    notificationMocks.verifyResendWebhookSignature.mockImplementation(() => {
      throw new Error("Invalid Resend webhook signature");
    });

    const response = await POST(makeRequest("{}"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid Resend webhook" });
    expect(serviceRoleMocks.createServiceRoleClient).not.toHaveBeenCalled();
  });
});
