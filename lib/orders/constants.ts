/**
 * Stripe metadata key for correlating Checkout Sessions, SetupIntents, and (later) settlement
 * PaymentIntents to `orders.id` (M4-C).
 */
export const STRIPE_METADATA_ORDER_ID_KEY = "order_id" as const;

/** Stripe PaymentIntent metadata for M4-C off-session settlement charge. */
export const STRIPE_METADATA_FLOW_M4C_SETTLEMENT = "m4c_settlement" as const;
export const STRIPE_METADATA_FLOW_M4C_SETUP = "m4c_setup" as const;
export const STRIPE_METADATA_FLOW_M4C_PAYMENT_RECOVERY =
  "m4c_payment_recovery" as const;

/** Matches `orders.status` CHECK constraint. */
export const ORDER_STATUSES = [
  "awaiting_payment",
  "awaiting_vendor_approval",
  "payment_pending",
  "paid",
  "failed",
  "reconciliation_required",
  "cancelled",
  "refunded",
  "declined",
  "expired",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Runtime membership check (e.g. `updateOrderStatus`). */
export const ORDER_STATUS_SET = new Set<OrderStatus>(ORDER_STATUSES);

/** Single source for inserts; matches `orders.currency` default. */
export const ORDER_CURRENCY_USD = "usd" as const;
