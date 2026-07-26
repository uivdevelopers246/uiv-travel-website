import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import type { AccommodationBookingStatus } from "./constants";

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

export type AccommodationBooking =
  Database["public"]["Tables"]["accommodation_bookings"]["Row"];

/**
 * Payload for creating a stay hold after SetupIntent success (Stripe webhook).
 * Callers must use a **service role** Supabase client: the atomic RPC is not granted to
 * `authenticated`.
 */
export type CreateAccommodationBookingAfterSetupInput = {
  accommodation_id: string;
  user_id: string;
  vendor_id: string;
  order_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  unit_price_cents: number;
  subtotal_cents: number;
  total_cents: number;
  /** MVP default: `0` when omitted. */
  discount_cents?: number;
  /** Default: `pending_approval` (M4-C / M4-D). */
  status?: AccommodationBookingStatus;
  /** Required when `status` is `pending_approval`. */
  expires_at?: string | null;
};

export type ListAccommodationBookingsOptions = {
  userId?: string;
  vendorId?: string;
  accommodationId?: string;
  orderId?: string;
  status?: AccommodationBookingStatus;
  limit?: number;
  offset?: number;
};

export async function listAccommodationBookings(
  supabase: SupabaseClient<Database>,
  opts?: ListAccommodationBookingsOptions,
): Promise<AccommodationBooking[]> {
  const limit = opts?.limit ?? 10;
  const offset = opts?.offset ?? 0;

  let query = supabase.from("accommodation_bookings").select("*");

  if (opts?.accommodationId !== undefined) {
    query = query.eq("accommodation_id", opts.accommodationId);
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
    throw bookingServiceError("Could not list accommodation bookings", error);
  }
  return (data ?? []) as AccommodationBooking[];
}

/**
 * Creates a stay booking after SetupIntent: listing lock, overlap check, then insert.
 * **Requires a service role** client (`create_accommodation_booking_after_setup` is not
 * executable as `authenticated`).
 */
export async function createAccommodationBookingAfterSetup(
  supabase: SupabaseClient<Database>,
  input: CreateAccommodationBookingAfterSetupInput,
): Promise<AccommodationBooking> {
  const discount_cents = input.discount_cents ?? 0;
  const status = input.status ?? "pending_approval";
  const rpcInput = {
    p_accommodation_id: input.accommodation_id,
    p_user_id: input.user_id,
    p_vendor_id: input.vendor_id,
    p_order_id: input.order_id,
    p_check_in: input.check_in,
    p_check_out: input.check_out,
    p_guests: input.guests,
    p_unit_price_cents: input.unit_price_cents,
    p_subtotal_cents: input.subtotal_cents,
    p_discount_cents: discount_cents,
    p_total_cents: input.total_cents,
    p_status: status,
    p_expires_at: input.expires_at ?? null,
  };

  const { data, error } = await supabase.rpc(
    "create_accommodation_booking_after_setup",
    rpcInput as never,
  );

  if (error) {
    throw bookingServiceError(
      "Could not create accommodation booking after setup",
      error,
    );
  }
  if (!data) {
    throw new Error(
      "Accommodation booking was not created: create_accommodation_booking_after_setup returned no row.",
    );
  }
  return data as AccommodationBooking;
}

/**
 * Cancels **confirmed** and **pending_approval** stays for an order (webhook rollback).
 * RPC is granted to **`service_role` only**.
 */
export async function cancelAccommodationBookingsForOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  const { error } = await supabase.rpc("cancel_accommodation_bookings_for_order", {
    p_order_id: orderId,
  });

  if (error) {
    throw bookingServiceError(
      "Could not cancel accommodation bookings for order",
      error,
    );
  }
}
