import { beforeEach, describe, expect, it, vi } from "vitest";

import { isResendEmailConfigured, sendEmailWithResend } from "./resend";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"id":"resend-email-1"}'),
    }),
  );
});

describe("resend transport", () => {
  it("detects whether Resend email is configured", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    expect(isResendEmailConfigured()).toBe(false);

    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "UIV Travel <bookings@example.com>");

    expect(isResendEmailConfigured()).toBe(true);
  });

  it("sends email through Resend with sender, recipient, body, and idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "UIV Travel <bookings@example.com>");

    const result = await sendEmailWithResend({
      to: "traveler@example.com",
      subject: "Booking confirmed",
      html: "<p>Confirmed</p>",
      text: "Confirmed",
      idempotencyKey: "booking:booking-1:booking_confirmed",
    });

    expect(result).toEqual({
      messageId: "resend-email-1",
      rawResponse: { id: "resend-email-1" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer re_test",
          "content-type": "application/json",
          "idempotency-key": "booking:booking-1:booking_confirmed",
        }),
        body: JSON.stringify({
          from: "UIV Travel <bookings@example.com>",
          to: "traveler@example.com",
          subject: "Booking confirmed",
          html: "<p>Confirmed</p>",
          text: "Confirmed",
        }),
      }),
    );
  });
});
