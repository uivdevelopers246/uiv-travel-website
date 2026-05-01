import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import type { ActivityBookingStatus } from "./constants";

/** Wraps upstream errors so logs and API mapping identify which operation failed. */
function bookingServiceError(
  operationDescription: string,
  cause?: { message?: string } | null,
): Error {
  const detail =
    cause && typeof cause.message === "string" && cause.message.trim() !== ""
      ? cause.message.trim()
      : "The database did not return a more specific message.";
  return new Error(`${operationDescription}: ${detail}`);
}

export type ActivityBooking =
  Database["public"]["Tables"]["activity_bookings"]["Row"];

/**
 * Payload for creating a booking after successful payment (e.g. Stripe webhook).
 * Callers must use a **service role** Supabase client: the atomic RPC is not granted to
 * `authenticated`. Site admins may still insert via the admin table policy if needed.
 */
export type CreateActivityBookingAfterPaymentInput = {
  slot_id: string;
  activity_id: string;
  user_id: string;
  vendor_id: string;
  order_id: string;
  participants: number;
  unit_price_cents: number;
  subtotal_cents: number;
  total_cents: number;
  /** MVP default: `0` when omitted. */
  discount_cents?: number;
  /** Default: `confirmed`. */
  status?: ActivityBookingStatus;
  /** Required when `status` is `pending_approval` (M4-C). */
  expires_at?: string | null;
};

export type ListActivityBookingsOptions = {
  /** Filter by booking owner (consumer list). */
  userId?: string;
  /** Filter by vendor (vendor dashboard list). */
  vendorId?: string;
  /** Filter by activity  */
  activityId?: string;
  /** Filter by availability slot. */
  slotId?: string;
  /** Filter by checkout order. */
  orderId?: string;
  status?: ActivityBookingStatus;
  limit?: number;
  offset?: number;
};

export async function listActivityBookings(
  supabase: SupabaseClient<Database>,
  opts?: ListActivityBookingsOptions,
): Promise<ActivityBooking[]> {
  const limit = opts?.limit ?? 10;
  const offset = opts?.offset ?? 0;

  let query = supabase.from("activity_bookings").select("*");

  if (opts?.activityId !== undefined) {
    query = query.eq("activity_id", opts.activityId);
  }
  if (opts?.slotId !== undefined) {
    query = query.eq("slot_id", opts.slotId);
  }
  if (opts?.orderId !== undefined) {
    query = query.eq("order_id", opts.orderId);
  }
  if (opts?.userId !== undefined) {
    query = query.eq("user_id", opts.userId);
  }
  if (opts?.vendorId !== undefined) {
    query = query.eq("vendor_id", opts.vendorId);
  }
  if (opts?.status !== undefined) {
    query = query.eq("status", opts.status);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw bookingServiceError("Could not list activity bookings", error);
  }
  return (data ?? []) as ActivityBooking[];
}

export async function getActivityBookingById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ActivityBooking | null> {
  const { data, error } = await supabase
    .from("activity_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw bookingServiceError("Could not load activity booking by id", error);
  }
  return data ?? null;
}

/**
 * Sets a booking to **completed**. Caller must pass `isAdmin: true` only after verifying
 * admin role (e.g. `getUserRole` in the API route). RLS blocks non-admins if mis-called.
 */
export async function setActivityBookingCompleted(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  options: { isAdmin: boolean },
): Promise<ActivityBooking> {
  if (!options.isAdmin) {
    throw new Error("Forbidden: Only admins can mark a booking as completed.");
  }

  const { data, error } = await supabase
    .from("activity_bookings")
    .update({ status: "completed" })
    .eq("id", bookingId)
    .select("*")
    .single();

  if (error) {
    throw bookingServiceError(
      "Could not mark activity booking as completed",
      error,
    );
  }
  return data as ActivityBooking;
}

/**
 * Creates a booking in one transaction: slot lock, capacity check, alignment of slot vs
 * activity/vendor, then insert. **Requires a service role** client (`create_activity_booking_after_payment` is not executable as `authenticated`).
 */
export async function createActivityBookingAfterPayment(
  supabase: SupabaseClient<Database>,
  input: CreateActivityBookingAfterPaymentInput,
): Promise<ActivityBooking> {
  const discount_cents = input.discount_cents ?? 0;
  const status = input.status ?? "confirmed";

  const { data, error } = await supabase.rpc("create_activity_booking_after_payment", {
    p_slot_id: input.slot_id,
    p_activity_id: input.activity_id,
    p_user_id: input.user_id,
    p_vendor_id: input.vendor_id,
    p_order_id: input.order_id,
    p_participants: input.participants,
    p_unit_price_cents: input.unit_price_cents,
    p_subtotal_cents: input.subtotal_cents,
    p_discount_cents: discount_cents,
    p_total_cents: input.total_cents,
    p_status: status,
    p_expires_at: input.expires_at ?? undefined,
  });

  if (error) {
    throw bookingServiceError(
      "Could not create activity booking after payment",
      error,
    );
  }
  if (!data) {
    throw new Error(
      "Activity booking was not created: create_activity_booking_after_payment returned no row.",
    );
  }
  return data as ActivityBooking;
}

/**
 * Cancels the caller's own **confirmed** booking via `cancel_activity_booking` RPC.
 * On failure, `error.message` reflects DB rules (e.g. not owned, not confirmed, not found).
 */
export async function cancelActivityBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<void> {
  const { error } = await supabase.rpc("cancel_activity_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    throw bookingServiceError("Could not cancel activity booking", error);
  }
}

/**
 * Cancels all **confirmed** bookings for an order (webhook rollback). RPC is granted
 * to **`service_role` only** — use a service-role Supabase client.
 */
export async function cancelActivityBookingsForOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  const { error } = await supabase.rpc("cancel_activity_bookings_for_order", {
    p_order_id: orderId,
  });

  if (error) {
    throw bookingServiceError(
      "Could not cancel activity bookings for order",
      error,
    );
  }
}

/**
 * M4-C vendor decline before charge: **`pending_approval` → `declined`** for one vendor on the order.
 * **`service_role` only** — use {@link createServiceRoleClient}.
 */
export async function declinePendingActivityBookingsForVendorOnOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
  vendorId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "decline_pending_activity_bookings_for_vendor_on_order",
    {
      p_order_id: orderId,
      p_vendor_id: vendorId,
    },
  );

  if (error) {
    throw bookingServiceError(
      "Could not decline pending activity bookings for vendor on order",
      error,
    );
  }
  return data ?? 0;
}

/**
 * M4-C: **`pending_approval` → `confirmed`** for one booking if **`vendor_id`** matches.
 * **`service_role` only.**
 */
export async function confirmPendingActivityBookingForVendor(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  vendorId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "confirm_pending_activity_booking_for_vendor",
    {
      p_booking_id: bookingId,
      p_vendor_id: vendorId,
    },
  );

  if (error) {
    throw bookingServiceError(
      "Could not confirm pending activity booking for vendor",
      error,
    );
  }
  return data ?? 0;
}

/**
 * M4-C: **`pending_approval` → `declined`** for one booking if **`vendor_id`** matches.
 * **`service_role` only.**
 */
export async function declinePendingActivityBookingForVendor(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  vendorId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "decline_pending_activity_booking_for_vendor",
    {
      p_booking_id: bookingId,
      p_vendor_id: vendorId,
    },
  );

  if (error) {
    throw bookingServiceError(
      "Could not decline pending activity booking for vendor",
      error,
    );
  }
  return data ?? 0;
}

/** M4-C: admin single-booking confirm. **`service_role` only. */
export async function confirmPendingActivityBookingAsAdmin(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "confirm_pending_activity_booking_as_admin",
    { p_booking_id: bookingId },
  );

  if (error) {
    throw bookingServiceError(
      "Could not confirm pending activity booking as admin",
      error,
    );
  }
  return data ?? 0;
}

/** M4-C: admin single-booking decline. **`service_role` only. */
export async function declinePendingActivityBookingAsAdmin(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "decline_pending_activity_booking_as_admin",
    { p_booking_id: bookingId },
  );

  if (error) {
    throw bookingServiceError(
      "Could not decline pending activity booking as admin",
      error,
    );
  }
  return data ?? 0;
}

/**
 * M4-C: confirm **all** **`pending_approval`** rows on an order (admin). **`service_role` only.**
 */
export async function confirmAllPendingActivityBookingsForOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "confirm_all_pending_activity_bookings_for_order",
    { p_order_id: orderId },
  );

  if (error) {
    throw bookingServiceError(
      "Could not confirm all pending activity bookings for order",
      error,
    );
  }
  return data ?? 0;
}

/**
 * M4-C admin / full-order decline: all **`pending_approval`** rows → **`declined`**.
 * **`service_role` only** — use {@link createServiceRoleClient}.
 */
export async function declineAllPendingActivityBookingsForOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  const { error } = await supabase.rpc("decline_activity_bookings_for_order", {
    p_order_id: orderId,
  });

  if (error) {
    throw bookingServiceError(
      "Could not decline pending activity bookings for order",
      error,
    );
  }
}
