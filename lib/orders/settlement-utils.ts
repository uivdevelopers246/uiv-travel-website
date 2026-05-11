import type { ActivityBooking } from "@/lib/activity-bookings/service";

/** Sum of **`total_cents`** for **`confirmed`** lines only (M4-C settlement amount). */
export function computeConfirmedSettlementTotalCents(
  bookings: Pick<ActivityBooking, "status" | "total_cents">[],
): number {
  let sum = 0;
  for (const b of bookings) {
    if (b.status === "confirmed") {
      sum += b.total_cents;
    }
  }
  return Math.max(0, Math.round(sum));
}

/**
 * Each saved payment method (SetupIntent) defines a distinct settlement cycle for an order.
 * Include it in the Stripe idempotency key so payment recovery does not collide with the
 * original failed settlement attempt.
 */
export function buildSettlementIdempotencyKey(
  orderId: string,
  stripeSetupIntentId: string,
  attempt: 1 | 2,
): string {
  return `m4c-settlement-${orderId}-${stripeSetupIntentId}-${attempt}`;
}

/** True when no line is still **`pending_approval`** (vendors finished; ready for decline sync or settlement). */
export function orderBookingsFullyResolvedForSettlement(
  bookings: { status: string }[],
): boolean {
  if (bookings.length === 0) {
    return false;
  }
  return bookings.every((b) => b.status !== "pending_approval");
}
