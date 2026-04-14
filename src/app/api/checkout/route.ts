import { NextResponse } from "next/server";
import {
  listCartLines,
  validateActivityCartForCheckout,
} from "@/lib/cart/service";
import { upsertAwaitingPaymentOrderFromCart, updateOrderStripeCheckoutSession } from "@/lib/orders/service";
import {
  createCheckoutSetupSessionForOrder,
  ensureStripeCustomerForOrder,
  getPublicSiteUrl,
} from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import { handleCartRouteError } from "@/api-shared/cart-route-errors";
import {
  badRequest,
  notFound,
  requireRole,
  serverError,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

function handleCheckoutPostError(error: unknown): NextResponse {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";

  if (
    message === "Cart line totals do not match order total" ||
    message === "Checkout requires at least one activity line" ||
    message === "Invalid participants on cart line"
  ) {
    return badRequest(message);
  }
  if (message === "Order not found") {
    return notFound(message);
  }
  return handleCartRouteError(error);
}

export async function POST() {
  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["user", "vendor", "admin"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  try {
    await validateActivityCartForCheckout(supabase);
    const order = await upsertAwaitingPaymentOrderFromCart(supabase);
    const lines = await listCartLines(supabase);
    const siteUrl = getPublicSiteUrl();
    const session = await createCheckoutSetupSessionForOrder({
      order,
      lines,
      siteUrl,
      stripeCustomerId: await ensureStripeCustomerForOrder(supabase, order),
    });

    await updateOrderStripeCheckoutSession(supabase, {
      orderId: order.id,
      stripeCheckoutSessionId: session.id,
    });
    if (!session.url) {
      return serverError("Something went wrong. Please try again.");
    }
    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    return handleCheckoutPostError(error);
  }
}
