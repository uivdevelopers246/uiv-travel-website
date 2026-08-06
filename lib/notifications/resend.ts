import "server-only";

import type { Json } from "@/supabase/types/database";
import type { EmailSendInput, EmailSendResult } from "./email-worker";
import { NotificationDeliveryError } from "./delivery-error";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

function getResendApiKey(): string {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  return apiKey;
}

function getEmailFrom(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error("EMAIL_FROM environment variable is not set");
  }
  return from;
}

export function isResendEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

function parseResendSendResponse(value: unknown): EmailSendResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Resend response did not include an email id");
  }

  const body = value as Record<string, unknown>;
  if (typeof body.id !== "string" || body.id.trim() === "") {
    throw new Error("Resend response did not include an email id");
  }

  return {
    messageId: body.id,
    rawResponse: body as Json,
  };
}

export async function sendEmailWithResend(
  input: EmailSendInput,
): Promise<EmailSendResult> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${getResendApiKey()}`,
    "content-type": "application/json",
  };

  if (input.idempotencyKey) {
    headers["idempotency-key"] = input.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: getEmailFrom(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
  } catch (error) {
    throw new NotificationDeliveryError("Resend email delivery request failed", {
      retryable: true,
      cause: error,
    });
  }
  const text = await response.text();

  if (!response.ok) {
    throw new NotificationDeliveryError(
      `Resend email delivery failed with ${response.status}: ${text}`,
      {
        retryable: response.status === 429 || response.status >= 500,
        statusCode: response.status,
      },
    );
  }

  try {
    return parseResendSendResponse(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Resend response was not valid JSON");
    }
    throw error;
  }
}
