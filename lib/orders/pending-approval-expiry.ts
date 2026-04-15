import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";

import { syncOrderDeclinedWhenNoPendingHoldsRemain } from "./vendor-approval";

/**
 * Distinct **`orders.id`** values that currently have at least one
 * **`pending_approval`** booking past **`expires_at`** (SLA breach).
 */
export async function listOrderIdsWithPendingApprovalPastSla(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("activity_bookings")
    .select("order_id")
    .eq("status", "pending_approval")
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString())
    .not("order_id", "is", null);

  if (error) {
    throw new Error(
      `Could not list orders with expirable pending approvals: ${error.message}`,
    );
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.order_id) {
      ids.add(row.order_id);
    }
  }
  return [...ids];
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
 */
export async function runPendingApprovalExpirySweep(
  supabase: SupabaseClient<Database>,
): Promise<PendingApprovalExpirySweepResult> {
  const orderIdsSynced = await listOrderIdsWithPendingApprovalPastSla(supabase);

  const { data: expiredRaw, error: expireError } = await supabase.rpc(
    "expire_pending_activity_bookings",
  );

  if (expireError) {
    throw new Error(
      `expire_pending_activity_bookings failed: ${expireError.message}`,
    );
  }

  const expiredCount =
    typeof expiredRaw === "number" ? expiredRaw : Number(expiredRaw);

  for (const orderId of orderIdsSynced) {
    await syncOrderDeclinedWhenNoPendingHoldsRemain(supabase, orderId);
  }

  return { expiredCount, orderIdsSynced };
}
