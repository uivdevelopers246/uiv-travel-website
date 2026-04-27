import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/supabase/types/database";

import { syncOrderDeclinedWhenNoPendingHoldsRemain } from "./vendor-approval";

function parseExpirePendingActivityBookingsPayload(
  raw: Json | null,
): { expiredCount: number; orderIds: string[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      "expire_pending_activity_bookings returned an invalid payload shape",
    );
  }

  const expiredCount = (raw as Record<string, Json | undefined>)["expired_count"];
  if (
    typeof expiredCount !== "number" ||
    !Number.isFinite(expiredCount) ||
    !Number.isInteger(expiredCount) ||
    expiredCount < 0
  ) {
    throw new Error(
      "expire_pending_activity_bookings returned invalid expired_count",
    );
  }

  const orderIdsRaw = (raw as Record<string, Json | undefined>)["order_ids"];
  if (!Array.isArray(orderIdsRaw)) {
    throw new Error(
      "expire_pending_activity_bookings returned invalid order_ids",
    );
  }

  const orderIds: string[] = [];
  for (const id of orderIdsRaw) {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(
        "expire_pending_activity_bookings returned invalid order_ids entry",
      );
    }
    orderIds.push(id);
  }

  return { expiredCount, orderIds };
}

export type PendingApprovalExpirySweepResult = {
  /** Rows updated by **`expire_pending_activity_bookings`** (DB RPC). */
  expiredCount: number;
  /** Distinct orders for which **`syncOrderDeclinedWhenNoPendingHoldsRemain`** was run (no Stripe). */
  orderIdsSynced: string[];
};

/**
 * M4-C SLA sweep: **`pending_approval`** past **`expires_at`** → **`expired`**, then for each
 * affected order sync **`declined`** when no **`pending_approval`** remains and every line is
 * terminal without **`confirmed`**. Does **not** create settlement Stripe charges.
 *
 * Uses a single RPC call so expiry metrics and **`order_id`** list share the database **`now()`**
 * time base (same **`UPDATE … RETURNING`**).
 */
export async function runPendingApprovalExpirySweep(
  supabase: SupabaseClient<Database>,
): Promise<PendingApprovalExpirySweepResult> {
  const { data: rpcData, error: expireError } = await supabase.rpc(
    "expire_pending_activity_bookings",
  );

  if (expireError) {
    throw new Error(
      `expire_pending_activity_bookings failed: ${expireError.message}`,
    );
  }

  const { expiredCount, orderIds: orderIdsSynced } =
    parseExpirePendingActivityBookingsPayload(rpcData);

  for (const orderId of orderIdsSynced) {
    await syncOrderDeclinedWhenNoPendingHoldsRemain(supabase, orderId);
  }

  return { expiredCount, orderIdsSynced };
}
