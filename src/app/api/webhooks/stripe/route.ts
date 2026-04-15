import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  fulfillCheckoutSetupSessionCompleted,
  fulfillSetupIntentSucceeded,
  parseAndVerifyStripeWebhook,
} from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { serverError } from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

function checkoutSessionCompletedResponse(
  result: Awaited<ReturnType<typeof fulfillCheckoutSetupSessionCompleted>>,
): NextResponse {
  switch (result.status) {
    case "duplicate_event":
    case "already_fulfilled":
    case "success":
    case "ignored":
    case "partial_failure_rolled_back":
    case "session_mismatch_marked_failed":
      return NextResponse.json({ received: true });
    case "order_not_found":
      return serverError("Something went wrong. Please try again.");
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

function setupIntentSucceededResponse(
  result: Awaited<ReturnType<typeof fulfillSetupIntentSucceeded>>,
): NextResponse {
  return checkoutSessionCompletedResponse(result);
}

export async function POST(request: Request) {
  let event: Stripe.Event;
  try {
    event = await parseAndVerifyStripeWebhook(request);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const result = await fulfillCheckoutSetupSessionCompleted(event, supabase);
        return checkoutSessionCompletedResponse(result);
      }
      case "setup_intent.succeeded": {
        const result = await fulfillSetupIntentSucceeded(event, supabase);
        return setupIntentSucceededResponse(result);
      }
      default:
        return NextResponse.json({ received: true });
    }
  } catch {
    return serverError("Something went wrong. Please try again.");
  }
}
