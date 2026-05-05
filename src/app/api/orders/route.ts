import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listOrdersWithActivityBookingsPreview } from "@/lib/orders/service";
import { getOrderPaymentSummary } from "@/lib/stripe/server";
import {
  badRequest,
  parseUuidParam,
  requireRole,
  serverError,
  unauthorized,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["user", "vendor", "admin"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }

  const url = new URL(request.url);
  const orderIdParam = url.searchParams.get("orderId");
  if (orderIdParam) {
    const parsed = parseUuidParam(orderIdParam, "order");
    if ("response" in parsed) {
      return badRequest("Invalid order id.");
    }
  }

  try {
    const orders = await listOrdersWithActivityBookingsPreview(supabase, {
      orderId: orderIdParam ?? undefined,
    });
    const ordersWithPaymentSummary = await Promise.all(
      orders.map(async (order) => ({
        ...order,
        payment_summary: await getOrderPaymentSummary(order),
      })),
    );
    return NextResponse.json(ordersWithPaymentSummary);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return serverError("Could not load orders");
  }
}
