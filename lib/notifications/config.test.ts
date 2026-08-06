import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getNotificationConfig,
  isNotificationRecipientAllowed,
} from "./config";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "UIV Travel <notifications@example.com>");
  vi.stubEnv("NOTIFICATION_TRANSPORT", "resend");
});

describe("notification configuration", () => {
  it("uses explicit unrestricted Resend delivery locally", () => {
    vi.stubEnv("APP_ENV", "local");

    expect(getNotificationConfig()).toMatchObject({
      appEnv: "local",
      deliveryEnabled: true,
      transport: "resend",
      recipientPolicy: "unrestricted",
    });
  });

  it("fails closed when staging has no recipient allowlist", () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NOTIFICATION_TRANSPORT", "resend");
    vi.stubEnv("NOTIFICATION_EMAIL_ALLOWLIST", "");

    expect(() => getNotificationConfig()).toThrow(
      "Staging notification delivery requires a non-empty",
    );
  });

  it("enforces the staging allowlist case-insensitively", () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NOTIFICATION_TRANSPORT", "resend");
    vi.stubEnv("NOTIFICATION_EMAIL_ALLOWLIST", "QA@Example.com, second@example.com");
    const config = getNotificationConfig();

    expect(isNotificationRecipientAllowed(config, "qa@example.com")).toBe(true);
    expect(isNotificationRecipientAllowed(config, "customer@example.com")).toBe(
      false,
    );
  });

  it("requires explicit transport in production", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NOTIFICATION_TRANSPORT", "");

    expect(() => getNotificationConfig()).toThrow(
      "NOTIFICATION_TRANSPORT is required",
    );
  });

  it("uses unrestricted recipients in production", () => {
    vi.stubEnv("APP_ENV", "production");

    expect(getNotificationConfig()).toMatchObject({
      appEnv: "production",
      transport: "resend",
      recipientPolicy: "unrestricted",
    });
  });

  it("requires explicit transport locally", () => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NOTIFICATION_TRANSPORT", "");

    expect(() => getNotificationConfig()).toThrow(
      "NOTIFICATION_TRANSPORT is required",
    );
  });

  it("rejects partial Resend configuration", () => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("EMAIL_FROM", "");

    expect(() => getNotificationConfig()).toThrow(
      "RESEND_API_KEY and EMAIL_FROM must be configured together",
    );
  });

  it("allows the kill switch without provider credentials", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NOTIFICATION_TRANSPORT", "resend");
    vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "false");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    expect(getNotificationConfig().deliveryEnabled).toBe(false);
  });

  it("rejects partial Resend configuration while delivery is disabled", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NOTIFICATION_DELIVERY_ENABLED", "false");
    vi.stubEnv("EMAIL_FROM", "");

    expect(() => getNotificationConfig()).toThrow(
      "RESEND_API_KEY and EMAIL_FROM must be configured together",
    );
  });

  it("requires both webhook transport credentials", () => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NOTIFICATION_TRANSPORT", "webhook");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("EMAIL_DELIVERY_WEBHOOK_URL", "https://example.com/email");

    expect(() => getNotificationConfig()).toThrow(
      "EMAIL_DELIVERY_WEBHOOK_URL and EMAIL_DELIVERY_WEBHOOK_SECRET",
    );
  });
});
