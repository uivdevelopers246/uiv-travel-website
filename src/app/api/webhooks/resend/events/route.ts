import { NextResponse } from "next/server";

import { serverError } from "@/api-shared/route-helpers";
import {
  parseResendWebhookPayload,
  processResendWebhookFeedback,
  verifyResendWebhookSignature,
} from "@/lib/notifications/resend-feedback";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: ReturnType<typeof parseResendWebhookPayload>;
  try {
    const rawBody = await request.text();
    verifyResendWebhookSignature(rawBody, request.headers);
    payload = parseResendWebhookPayload(
      JSON.parse(rawBody),
      request.headers.get("svix-id"),
    );
  } catch {
    return NextResponse.json({ error: "Invalid Resend webhook" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await processResendWebhookFeedback(supabase, payload);
    return NextResponse.json({ received: true, result }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
    return serverError(message);
  }
}
