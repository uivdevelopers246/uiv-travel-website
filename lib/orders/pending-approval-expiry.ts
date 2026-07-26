import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/supabase/types/database";
import { getAccommodationBookingById } from "@/lib/accommodation-bookings/service";
import { getActivityBookingById } from "@/lib/activity-bookings/service";

import { syncOrderM4cAfterBookingChange } from "./vendor-approval";
import { safeSendBookingStatusEmailHook } from "@/lib/orders/status-email-hooks";

function parseExpirePendingBookingsPayload(
  raw: Json | null,
  rpcName: string,
): { expiredCount: number; orderIds: string[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${rpcName} returned an invalid payload shape`);
  }

  const expiredCount = (raw as Record<string, Json | undefined>)["expired_count"];
  if (
    typeof expiredCount !== "number" ||
    !Number.isFinite(expiredCount) ||
    !Number.isInteger(expiredCount) ||
    expiredCount < 0
  ) {
    throw new Error(`${rpcName} returned invalid expired_count`);
  }

  const orderIdsRaw = (raw as Record<string, Json | undefined>)["order_ids"];
  if (!Array.isArray(orderIdsRaw)) {
    throw new Error(`${rpcName} returned invalid order_ids`);
  }

  const orderIds: string[] = [];
  for (const id of orderIdsRaw) {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`${rpcName} returned invalid order_ids entry`);
    }
    orderIds.push(id);
  }

  return { expiredCount, orderIds };
}

/**
 * Captures likely-expiring activity booking ids before the RPC runs so the sweep can send
 * notification hooks only for rows that the database actually transitioned to **`expired`**.
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

/**
 * Captures likely-expiring stay booking ids before the accommodation expiry RPC runs.
 */
export async function listPendingApprovalAccommodationBookingsPastSla(
  supabase: SupabaseClient<Database>,
): Promise<Array<{ id: string }>> {
  const { data, error } = await supabase
    .from("accommodation_bookings")
    .select("id")
    .eq("status", "pending_approval")
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString());

  if (error) {
    throw new Error(
      `Could not list pending approval accommodation bookings past SLA: ${error.message}`,
    );
  }

  return (data ?? []).filter(
    (row): row is { id: string } => typeof row.id === "string" && row.id.length > 0,
  );
}

export type PendingApprovalExpirySweepResult = {
  /** Rows updated by activity + accommodation expiry RPCs. */
  expiredCount: number;
  /**
   * Distinct orders for which **`syncOrderM4cAfterBookingChange`** was run (same post-transition
   * hook as vendor approve/decline: may decline the order or start settlement).
   */
  orderIdsSynced: string[];
};

/**
 * M4-C / M4-D SLA sweep: **`pending_approval`** past **`expires_at`** → **`expired`** on both
 * booking tables, then for each affected order runs **`syncOrderM4cAfterBookingChange`**: sync
 * **`declined`** when every line is terminal without **`confirmed`**, or start settlement when
 * confirmed lines remain.
 *
 * Each table uses a single RPC so expiry metrics and **`order_id`** lists share the database
 * **`now()`** time base (same **`UPDATE … RETURNING`**).
 */
export async function runPendingApprovalExpirySweep(
  supabase: SupabaseClient<Database>,
): Promise<PendingApprovalExpirySweepResult> {
  const [expirableActivityBookings, expirableStayBookings] = await Promise.all([
    listPendingApprovalBookingsPastSla(supabase),
    listPendingApprovalAccommodationBookingsPastSla(supabase),
  ]);

  const { data: activityRpcData, error: activityExpireError } = await supabase.rpc(
    "expire_pending_activity_bookings",
  );

  if (activityExpireError) {
    throw new Error(
      `expire_pending_activity_bookings failed: ${activityExpireError.message}`,
    );
  }

  const { data: stayRpcData, error: stayExpireError } = await supabase.rpc(
    "expire_pending_accommodation_bookings",
  );

  if (stayExpireError) {
    throw new Error(
      `expire_pending_accommodation_bookings failed: ${stayExpireError.message}`,
    );
  }

  const activityExpired = parseExpirePendingBookingsPayload(
    activityRpcData,
    "expire_pending_activity_bookings",
  );
  const stayExpired = parseExpirePendingBookingsPayload(
    stayRpcData,
    "expire_pending_accommodation_bookings",
  );

  const orderIdsSynced = [
    ...new Set([...activityExpired.orderIds, ...stayExpired.orderIds]),
  ];

  for (const orderId of orderIdsSynced) {
    await syncOrderM4cAfterBookingChange(supabase, orderId);
  }

  for (const booking of expirableActivityBookings) {
    const latestBooking = await getActivityBookingById(supabase, booking.id);
    if (latestBooking?.status === "expired") {
      await safeSendBookingStatusEmailHook(supabase, {
        bookingId: booking.id,
        event: "booking_expired",
        lineType: "activity",
      });
    }
  }

  for (const booking of expirableStayBookings) {
    const latestBooking = await getAccommodationBookingById(supabase, booking.id);
    if (latestBooking?.status === "expired") {
      await safeSendBookingStatusEmailHook(supabase, {
        bookingId: booking.id,
        event: "booking_expired",
        lineType: "accommodation",
      });
    }
  }

  return {
    expiredCount: activityExpired.expiredCount + stayExpired.expiredCount,
    orderIdsSynced,
  };
}
