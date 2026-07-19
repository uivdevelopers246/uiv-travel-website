import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/supabase/types/database";
import { getActivityBookingById } from "@/lib/activity-bookings/service";

import { syncOrderM4cAfterBookingChange } from "./vendor-approval";
import { safeSendBookingStatusEmailHook } from "@/lib/orders/status-email-hooks";

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

/**
 * Captures likely-expiring booking ids before the RPC runs so the sweep can send notification
 * hooks only for rows that the database actually transitioned to **`expired`**.
 */
export async function listPendingApprovalBookingsPastSla(
  supabase: SupabaseClient<Database>,
): Promise<Array<{ id: string }>> {
  const { data, error } = await supabase
    .from("activity_bookings")
    .select("id")
    .eq("status", "pending_approval")
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString());

  if (error) {
    throw new Error(`Could not list pending approval bookings past SLA: ${error.message}`);
  }

  return (data ?? []).filter(
    (row): row is { id: string } => typeof row.id === "string" && row.id.length > 0,
  );
}

export type PendingApprovalExpirySweepResult = {
  /** Rows updated by **`expire_pending_activity_bookings`** (DB RPC). */
  expiredCount: number;
  /**
   * Distinct orders for which **`syncOrderM4cAfterBookingChange`** was run (same post-transition
   * hook as vendor approve/decline: may decline the order or start settlement).
   */
  orderIdsSynced: string[];
};

/**
 * M4-C SLA sweep: **`pending_approval`** past **`expires_at`** → **`expired`**, then for each
 * affected order runs **`syncOrderM4cAfterBookingChange`**: sync **`declined`** when every line is
 * terminal without **`confirmed`**, or start settlement when confirmed lines remain.
 *
 * Uses a single RPC call so expiry metrics and **`order_id`** list share the database **`now()`**
 * time base (same **`UPDATE … RETURNING`**).
 */
export async function runPendingApprovalExpirySweep(
  supabase: SupabaseClient<Database>,
): Promise<PendingApprovalExpirySweepResult> {
  const expirableBookings = await listPendingApprovalBookingsPastSla(supabase);
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
    await syncOrderM4cAfterBookingChange(supabase, orderId);
  }

  for (const booking of expirableBookings) {
    const latestBooking = await getActivityBookingById(supabase, booking.id);
    if (latestBooking?.status === "expired") {
      await safeSendBookingStatusEmailHook(supabase, {
        bookingId: booking.id,
        event: "booking_expired",
      });
    }
  }

  return { expiredCount, orderIdsSynced };
}
