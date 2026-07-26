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
import {
  confirmAllPendingAccommodationBookingsForOrder,
  confirmPendingAccommodationBookingAsAdmin,
  confirmPendingAccommodationBookingForVendor,
  declineAllPendingAccommodationBookingsForOrder,
  declinePendingAccommodationBookingAsAdmin,
  declinePendingAccommodationBookingForVendor,
  declinePendingAccommodationBookingsForVendorOnOrder,
  getAccommodationBookingById,
  listAccommodationBookings,
} from "@/lib/accommodation-bookings/service";
import { getVendorIdForCurrentUser } from "@/lib/vendors/ownership";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/supabase/types/database";
import { listOrderBookingLinesForM4c } from "@/lib/orders/order-booking-lines";
import { getOrderById, updateOrderStatus } from "@/lib/orders/service";
import type { Order } from "@/lib/orders/types";
import { tryBeginSettlementChargeForOrder } from "@/lib/orders/settlement";
import { safeSendBookingStatusEmailHook } from "@/lib/orders/status-email-hooks";

export type ApproveActivityOrderResult = { confirmedCount: number };
export type BookingApprovalOutcome =
  | "approved"
  | "payment_failed"
  | "payment_review";
export type BookingApprovalResult = {
  outcome: BookingApprovalOutcome;
};

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

  const bookings = await listOrderBookingLinesForM4c(supabaseService, orderId);
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

async function getBookingApprovalResult(
  supabaseService: SupabaseClient<Database>,
  orderId: string,
): Promise<BookingApprovalResult> {
  const order = await loadOrderForApprovalOrThrow(supabaseService, orderId);

  if (order.status === "failed") {
    return { outcome: "payment_failed" };
  }

  if (order.status === "reconciliation_required") {
    return { outcome: "payment_review" };
  }

  return { outcome: "approved" };
}

/**
 * Vendor: approve a **single** pending activity booking (no Stripe). Use once per line item the vendor accepts.
 */
export async function approveActivityBookingAsVendor(
  userSupabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<BookingApprovalResult> {
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
  const result = await getBookingApprovalResult(service, booking.order_id);
  if (result.outcome === "approved") {
    await safeSendBookingStatusEmailHook(service, {
      bookingId,
      event: "booking_confirmed",
      lineType: "activity",
    });
  }
  return result;
}

/**
 * Vendor: decline a **single** pending activity booking.
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
  await safeSendBookingStatusEmailHook(service, {
    bookingId,
    event: "booking_declined",
    lineType: "activity",
  });
}

/**
 * Vendor: approve a **single** pending accommodation booking (no Stripe).
 */
export async function approveAccommodationBookingAsVendor(
  userSupabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<BookingApprovalResult> {
  const vendorId = await getVendorIdForCurrentUser(userSupabase);
  const booking = await getAccommodationBookingById(userSupabase, bookingId);
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

  const n = await confirmPendingAccommodationBookingForVendor(
    service,
    bookingId,
    vendorId,
  );
  if (n === 0) {
    throw new Error("Could not confirm booking");
  }
  await syncOrderM4cAfterBookingChange(service, booking.order_id);
  const result = await getBookingApprovalResult(service, booking.order_id);
  if (result.outcome === "approved") {
    await safeSendBookingStatusEmailHook(service, {
      bookingId,
      event: "booking_confirmed",
      lineType: "accommodation",
    });
  }
  return result;
}

/**
 * Vendor: decline a **single** pending accommodation booking.
 */
export async function declineAccommodationBookingAsVendor(
  userSupabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<void> {
  const vendorId = await getVendorIdForCurrentUser(userSupabase);
  const booking = await getAccommodationBookingById(userSupabase, bookingId);
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
  const n = await declinePendingAccommodationBookingForVendor(
    service,
    bookingId,
    vendorId,
  );
  if (n === 0) {
    throw new Error("Could not decline booking");
  }
  await syncOrderM4cAfterBookingChange(service, booking.order_id);
  await safeSendBookingStatusEmailHook(service, {
    bookingId,
    event: "booking_declined",
    lineType: "accommodation",
  });
}

/**
 * Admin: approve one pending activity booking.
 */
export async function approveActivityBookingAsAdmin(
  bookingId: string,
): Promise<BookingApprovalResult> {
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
  const result = await getBookingApprovalResult(service, booking.order_id);
  if (result.outcome === "approved") {
    await safeSendBookingStatusEmailHook(service, {
      bookingId,
      event: "booking_confirmed",
      lineType: "activity",
    });
  }
  return result;
}

/**
 * Admin: decline one pending activity booking.
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
  await safeSendBookingStatusEmailHook(service, {
    bookingId,
    event: "booking_declined",
    lineType: "activity",
  });
}

/**
 * Admin: approve one pending accommodation booking.
 */
export async function approveAccommodationBookingAsAdmin(
  bookingId: string,
): Promise<BookingApprovalResult> {
  const service = createServiceRoleClient();
  const booking = await getAccommodationBookingById(service, bookingId);
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

  const n = await confirmPendingAccommodationBookingAsAdmin(service, bookingId);
  if (n === 0) {
    throw new Error("Could not confirm booking");
  }
  await syncOrderM4cAfterBookingChange(service, booking.order_id);
  const result = await getBookingApprovalResult(service, booking.order_id);
  if (result.outcome === "approved") {
    await safeSendBookingStatusEmailHook(service, {
      bookingId,
      event: "booking_confirmed",
      lineType: "accommodation",
    });
  }
  return result;
}

/**
 * Admin: decline one pending accommodation booking.
 */
export async function declineAccommodationBookingAsAdmin(
  bookingId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const booking = await getAccommodationBookingById(service, bookingId);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.status !== "pending_approval") {
    throw new Error("Booking is not pending approval");
  }
  if (!booking.order_id) {
    throw new Error("Booking has no order");
  }

  const n = await declinePendingAccommodationBookingAsAdmin(service, bookingId);
  if (n === 0) {
    throw new Error("Could not decline booking");
  }
  await syncOrderM4cAfterBookingChange(service, booking.order_id);
  await safeSendBookingStatusEmailHook(service, {
    bookingId,
    event: "booking_declined",
    lineType: "accommodation",
  });
}

/**
 * Admin: confirm **all** **`pending_approval`** lines on the order (activity + stay; no Stripe).
 */
export async function approveActivityOrderAsAdmin(
  orderId: string,
): Promise<ApproveActivityOrderResult & BookingApprovalResult> {
  const service = createServiceRoleClient();
  const order = await loadOrderForApprovalOrThrow(service, orderId);
  if (!orderAllowsVendorApproval(order)) {
    throw new Error(
      `Order is not awaiting vendor action (status: ${order.status})`,
    );
  }

  const [pendingActivities, pendingStays] = await Promise.all([
    listActivityBookings(service, {
      orderId,
      status: "pending_approval",
      limit: 500,
    }),
    listAccommodationBookings(service, {
      orderId,
      status: "pending_approval",
      limit: 500,
    }),
  ]);
  if (pendingActivities.length === 0 && pendingStays.length === 0) {
    throw new Error("No pending approval bookings for this order.");
  }

  let confirmedCount = 0;
  if (pendingActivities.length > 0) {
    confirmedCount += await confirmAllPendingActivityBookingsForOrder(
      service,
      orderId,
    );
  }
  if (pendingStays.length > 0) {
    confirmedCount += await confirmAllPendingAccommodationBookingsForOrder(
      service,
      orderId,
    );
  }
  await syncOrderM4cAfterBookingChange(service, orderId);
  const result = await getBookingApprovalResult(service, orderId);
  if (result.outcome === "approved") {
    for (const booking of pendingActivities) {
      await safeSendBookingStatusEmailHook(service, {
        bookingId: booking.id,
        event: "booking_confirmed",
        lineType: "activity",
      });
    }
    for (const booking of pendingStays) {
      await safeSendBookingStatusEmailHook(service, {
        bookingId: booking.id,
        event: "booking_confirmed",
        lineType: "accommodation",
      });
    }
  }
  return { confirmedCount, ...result };
}

/**
 * Vendor: declines **`pending_approval`** rows for the caller’s vendor only (activity + stay bulk).
 */
export async function declineActivityOrderAsVendor(
  userSupabase: SupabaseClient<Database>,
  orderId: string,
): Promise<{ declinedCount: number }> {
  const vendorId = await getVendorIdForCurrentUser(userSupabase);

  const [mineActivities, mineStays] = await Promise.all([
    listActivityBookings(userSupabase, {
      orderId,
      vendorId,
      status: "pending_approval",
      limit: 500,
    }),
    listAccommodationBookings(userSupabase, {
      orderId,
      vendorId,
      status: "pending_approval",
      limit: 500,
    }),
  ]);
  if (mineActivities.length === 0 && mineStays.length === 0) {
    throw new Error(
      "No pending approval bookings for your vendor on this order.",
    );
  }

  const service = createServiceRoleClient();
  let declinedCount = 0;
  if (mineActivities.length > 0) {
    declinedCount += await declinePendingActivityBookingsForVendorOnOrder(
      service,
      orderId,
      vendorId,
    );
  }
  if (mineStays.length > 0) {
    declinedCount += await declinePendingAccommodationBookingsForVendorOnOrder(
      service,
      orderId,
      vendorId,
    );
  }
  await syncOrderM4cAfterBookingChange(service, orderId);
  for (const booking of mineActivities) {
    await safeSendBookingStatusEmailHook(service, {
      bookingId: booking.id,
      event: "booking_declined",
      lineType: "activity",
    });
  }
  for (const booking of mineStays) {
    await safeSendBookingStatusEmailHook(service, {
      bookingId: booking.id,
      event: "booking_declined",
      lineType: "accommodation",
    });
  }
  return { declinedCount };
}

/**
 * Admin: declines all **`pending_approval`** rows on the order (activity + stay), then delegates to
 * **`syncOrderM4cAfterBookingChange`**: sets the order to **`declined`** only when it
 * is still in a vendor-approval state, no row is **`pending_approval`**, and every
 * booking is **`declined`**, **`expired`**, or **`cancelled`**; if any line is
 * **`confirmed`**, settlement may begin instead when M4-C conditions are met.
 */
export async function declineActivityOrderAsAdmin(orderId: string): Promise<void> {
  const service = createServiceRoleClient();

  const [pendingActivities, pendingStays] = await Promise.all([
    listActivityBookings(service, {
      orderId,
      status: "pending_approval",
      limit: 500,
    }),
    listAccommodationBookings(service, {
      orderId,
      status: "pending_approval",
      limit: 500,
    }),
  ]);
  if (pendingActivities.length === 0 && pendingStays.length === 0) {
    throw new Error("No pending approval bookings for this order.");
  }

  if (pendingActivities.length > 0) {
    await declineAllPendingActivityBookingsForOrder(service, orderId);
  }
  if (pendingStays.length > 0) {
    await declineAllPendingAccommodationBookingsForOrder(service, orderId);
  }
  await syncOrderM4cAfterBookingChange(service, orderId);
  for (const booking of pendingActivities) {
    await safeSendBookingStatusEmailHook(service, {
      bookingId: booking.id,
      event: "booking_declined",
      lineType: "activity",
    });
  }
  for (const booking of pendingStays) {
    await safeSendBookingStatusEmailHook(service, {
      bookingId: booking.id,
      event: "booking_declined",
      lineType: "accommodation",
    });
  }
}
