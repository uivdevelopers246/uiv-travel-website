import { NextResponse } from "next/server";

import { listActivityBookings } from "@/lib/activity-bookings/service";
import { getOrderById } from "@/lib/orders/service";
import {
  createPaymentMethodUpdateSessionForOrder,
  ensureStripeCustomerForOrder,
  getPublicSiteUrl,
} from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import {
  badRequest,
  parseUuidParam,
  requireRole,
  serverError,
  unauthorized,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const resolved = await params;
  const parsed = parseUuidParam(resolved?.orderId, "order");
  if ("response" in parsed) {
    return parsed.response;
  }

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["user", "vendor", "admin"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  try {
    const order = await getOrderById(supabase, parsed.id);
    if (!order || order.user_id !== user.id) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "failed") {
      return badRequest("Order is not eligible for payment recovery.");
    }
    if (order.settlement_charge_attempt_count !== 2) {
      return badRequest("Payment retry limit reached for this order.");
    }

    const bookings = await listActivityBookings(supabase, {
      orderId: order.id,
      userId: user.id,
      limit: 500,
    });
    const confirmedCount = bookings.filter(
      (booking) => booking.status === "confirmed",
    ).length;
    if (confirmedCount === 0) {
      return badRequest("Order has no confirmed bookings to charge.");
    }

    const stripeCustomerId = await ensureStripeCustomerForOrder(supabase, order);
    const session = await createPaymentMethodUpdateSessionForOrder({
      order,
      siteUrl: getPublicSiteUrl(),
      stripeCustomerId,
    });

    if (!session.url) {
      return serverError("Something went wrong. Please try again.");
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    if (message === "Unauthorized") {
      return unauthorized();
    }
    return serverError(message);
  }
}
