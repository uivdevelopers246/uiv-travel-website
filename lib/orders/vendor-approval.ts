import type { SupabaseClient } from "@supabase/supabase-js";
import {
  confirmAllPendingActivityBookingsForOrder,
  confirmPendingActivityBookingAsAdmin,
  confirmPendingActivityBookingForVendor,
  declineAllPendingActivityBookingsForOrder,
  declinePendingActivityBookingAsAdmin,
  declinePendingActivityBookingForVendor,
  declinePendingActivityBookingsForVendorOnOrder,
  getActivityBookingById,
  listActivityBookings,
} from "@/lib/activity-bookings/service";
import { getVendorIdForCurrentUser } from "@/lib/vendors/ownership";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/supabase/types/database";
import { getOrderById, updateOrderStatus } from "@/lib/orders/service";
import type { Order } from "@/lib/orders/types";
import { tryBeginSettlementChargeForOrder } from "@/lib/orders/settlement";

export type ApproveActivityOrderResult = { confirmedCount: number };

function terminalNonConfirmedStatus(status: string): boolean {
  return (
    status === "declined" ||
    status === "expired" ||
    status === "cancelled"
  );
}

function orderAllowsVendorApproval(order: Order): boolean {
  return (
    order.status === "awaiting_vendor_approval" || order.status === "payment_pending"
  );
}

/**
 * When no **`pending_approval`** rows remain and every booking is declined/expired/cancelled,
 * sets the order to **`declined`**.
 */
/**
 * After booking rows change (approve/decline) or after a sweep expires **`pending_approval`** lines:
 * sync all-declined orders, then start settlement when every line is terminal with **`confirmed`** totals.
 */
export async function syncOrderM4cAfterBookingChange(
  supabaseService: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  await syncOrderDeclinedWhenNoPendingHoldsRemain(supabaseService, orderId);
  await tryBeginSettlementChargeForOrder(supabaseService, orderId);
}

export async function syncOrderDeclinedWhenNoPendingHoldsRemain(
  supabaseService: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  const order = await getOrderById(supabaseService, orderId);
  if (!order) {
    return;
  }
  if (!orderAllowsVendorApproval(order)) {
    return;
  }

  const bookings = await listActivityBookings(supabaseService, {
    orderId,
    limit: 500,
  });
  if (bookings.length === 0) {
    return;
  }

  const hasPending = bookings.some((b) => b.status === "pending_approval");
  if (hasPending) {
    return;
  }

  const allTerminal = bookings.every((b) => terminalNonConfirmedStatus(b.status));
  if (allTerminal) {
    await updateOrderStatus(supabaseService, orderId, "declined");
  }
}

async function loadOrderForApprovalOrThrow(
  supabaseService: SupabaseClient<Database>,
  orderId: string,
): Promise<Order> {
  const order = await getOrderById(supabaseService, orderId);
  if (!order) {
    throw new Error("Order not found");
  }
  return order;
}

/**
 * Vendor: approve a **single** pending booking (no Stripe). Use once per line item the vendor accepts.
 */
export async function approveActivityBookingAsVendor(
  userSupabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<void> {
  const vendorId = await getVendorIdForCurrentUser(userSupabase);
  const booking = await getActivityBookingById(userSupabase, bookingId);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.status !== "pending_approval") {
    throw new Error("Booking is not pending approval");
  }
  if (booking.vendor_id !== vendorId) {
    throw new Error("Forbidden: You do not manage this booking.");
  }
  if (!booking.order_id) {
    throw new Error("Booking has no order");
  }

  const service = createServiceRoleClient();
  const order = await loadOrderForApprovalOrThrow(service, booking.order_id);
  if (!orderAllowsVendorApproval(order)) {
    throw new Error(
      `Order is not awaiting vendor action (status: ${order.status})`,
    );
  }

  const n = await confirmPendingActivityBookingForVendor(
    service,
    bookingId,
    vendorId,
  );
  if (n === 0) {
    throw new Error("Could not confirm booking");
  }
  await syncOrderM4cAfterBookingChange(service, booking.order_id);
}

/**
 * Vendor: decline a **single** pending booking.
 */
export async function declineActivityBookingAsVendor(
  userSupabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<void> {
  const vendorId = await getVendorIdForCurrentUser(userSupabase);
  const booking = await getActivityBookingById(userSupabase, bookingId);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.status !== "pending_approval") {
    throw new Error("Booking is not pending approval");
  }
  if (booking.vendor_id !== vendorId) {
    throw new Error("Forbidden: You do not manage this booking.");
  }
  if (!booking.order_id) {
    throw new Error("Booking has no order");
  }

  const service = createServiceRoleClient();
  const n = await declinePendingActivityBookingForVendor(
    service,
    bookingId,
    vendorId,
  );
  if (n === 0) {
    throw new Error("Could not decline booking");
  }
  await syncOrderM4cAfterBookingChange(service, booking.order_id);
}

/**
 * Admin: approve one pending booking.
 */
export async function approveActivityBookingAsAdmin(
  bookingId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const booking = await getActivityBookingById(service, bookingId);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.status !== "pending_approval") {
    throw new Error("Booking is not pending approval");
  }
  if (!booking.order_id) {
    throw new Error("Booking has no order");
  }

  const order = await loadOrderForApprovalOrThrow(service, booking.order_id);
  if (!orderAllowsVendorApproval(order)) {
    throw new Error(
      `Order is not awaiting vendor action (status: ${order.status})`,
    );
  }

  const n = await confirmPendingActivityBookingAsAdmin(service, bookingId);
  if (n === 0) {
    throw new Error("Could not confirm booking");
  }
  await syncOrderM4cAfterBookingChange(service, booking.order_id);
}

/**
 * Admin: decline one pending booking.
 */
export async function declineActivityBookingAsAdmin(
  bookingId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const booking = await getActivityBookingById(service, bookingId);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.status !== "pending_approval") {
    throw new Error("Booking is not pending approval");
  }
  if (!booking.order_id) {
    throw new Error("Booking has no order");
  }

  const n = await declinePendingActivityBookingAsAdmin(service, bookingId);
  if (n === 0) {
    throw new Error("Could not decline booking");
  }
  await syncOrderM4cAfterBookingChange(service, booking.order_id);
}

/**
 * Admin: confirm **all** **`pending_approval`** lines on the order (no Stripe).
 */
export async function approveActivityOrderAsAdmin(
  orderId: string,
): Promise<ApproveActivityOrderResult> {
  const service = createServiceRoleClient();
  const order = await loadOrderForApprovalOrThrow(service, orderId);
  if (!orderAllowsVendorApproval(order)) {
    throw new Error(
      `Order is not awaiting vendor action (status: ${order.status})`,
    );
  }

  const pending = await listActivityBookings(service, {
    orderId,
    status: "pending_approval",
    limit: 1,
  });
  if (pending.length === 0) {
    throw new Error("No pending approval bookings for this order.");
  }

  const confirmedCount = await confirmAllPendingActivityBookingsForOrder(
    service,
    orderId,
  );
  await syncOrderM4cAfterBookingChange(service, orderId);
  return { confirmedCount };
}

/**
 * Vendor: declines **`pending_approval`** rows for the caller’s vendor only (bulk).
 */
export async function declineActivityOrderAsVendor(
  userSupabase: SupabaseClient<Database>,
  orderId: string,
): Promise<{ declinedCount: number }> {
  const vendorId = await getVendorIdForCurrentUser(userSupabase);

  const mine = await listActivityBookings(userSupabase, {
    orderId,
    vendorId,
    status: "pending_approval",
    limit: 500,
  });
  if (mine.length === 0) {
    throw new Error(
      "No pending approval bookings for your vendor on this order.",
    );
  }

  const service = createServiceRoleClient();
  const declinedCount = await declinePendingActivityBookingsForVendorOnOrder(
    service,
    orderId,
    vendorId,
  );
  await syncOrderM4cAfterBookingChange(service, orderId);
  return { declinedCount };
}

/**
 * Admin: declines all **`pending_approval`** rows on the order, then delegates to
 * **`syncOrderM4cAfterBookingChange`**: sets the order to **`declined`** only when it
 * is still in a vendor-approval state, no row is **`pending_approval`**, and every
 * booking is **`declined`**, **`expired`**, or **`cancelled`**; if any line is
 * **`confirmed`**, settlement may begin instead when M4-C conditions are met.
 */
export async function declineActivityOrderAsAdmin(orderId: string): Promise<void> {
  const service = createServiceRoleClient();

  const pending = await listActivityBookings(service, {
    orderId,
    status: "pending_approval",
    limit: 1,
  });
  if (pending.length === 0) {
    throw new Error("No pending approval bookings for this order.");
  }

  await declineAllPendingActivityBookingsForOrder(service, orderId);
  await syncOrderM4cAfterBookingChange(service, orderId);
}
