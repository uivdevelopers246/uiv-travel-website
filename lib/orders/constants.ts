/** Matches `orders.status` CHECK constraint. */
export const ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "failed",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Runtime membership check (e.g. `updateOrderStatus`). */
export const ORDER_STATUS_SET = new Set<OrderStatus>(ORDER_STATUSES);

/** Single source for inserts; matches `orders.currency` default. */
export const ORDER_CURRENCY_USD = "usd" as const;
