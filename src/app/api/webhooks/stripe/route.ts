import { NextResponse } from "next/server";
import {
  fulfillCheckoutSessionCompleted,
  parseAndVerifyStripeWebhook,
} from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { serverError } from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let event: Awaited<ReturnType<typeof parseAndVerifyStripeWebhook>>;
  try {
    event = await parseAndVerifyStripeWebhook(request);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceRoleClient();

  try {
    const result = await fulfillCheckoutSessionCompleted(event, supabase);

    switch (result.status) {
      case "duplicate_event":
      case "already_fulfilled":
      case "success":
      case "ignored":
      case "amount_mismatch_marked_failed":
      case "partial_failure_marked_refunded":
        return NextResponse.json({ received: true });
      case "order_not_found":
        return serverError("Something went wrong. Please try again.");
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  } catch {
    return serverError("Something went wrong. Please try again.");
  }
}
