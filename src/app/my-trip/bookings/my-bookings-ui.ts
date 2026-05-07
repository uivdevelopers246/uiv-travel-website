import { getOrderStatusNotice } from "@/lib/orders/buyer-flow";
import type {
  ActivityBookingWithPreview,
  OrderWithActivityBookingsPaymentPreview,
} from "@/lib/orders/types";

export type UiTone = "amber" | "emerald" | "rose" | "sky" | "slate";

export type OrderPhaseKind =
  | "finalizing"
  | "vendor_review"
  | "payment_processing"
  | "payment_complete"
  | "payment_failed"
  | "support_review"
  | "no_payment_collected";

export type CountdownState =
  | { kind: "hidden" }
  | {
      kind: "active";
      deadlineAt: string;
      remainingMs: number;
      message: string;
    }
  | {
      kind: "expired";
      deadlineAt: string;
      message: string;
    };

export type OrderPhaseState = {
  kind: OrderPhaseKind;
  label: string;
  tone: UiTone;
};

export type PaymentActionState = {
  receiptUrl: string | null;
  canRetry: boolean;
  showContactSupport: boolean;
};

export type OrderNoticeState = {
  tone: UiTone;
  title: string;
  message: string;
  paymentLabel: string;
  nextStepLabel: string;
  failureMessage: string | null;
  actions: PaymentActionState;
};

export type BookingDisplayState = {
  booking: ActivityBookingWithPreview;
  statusLabel: string;
  tone: UiTone;
  detail: string;
  countdown: CountdownState;
};

export type OrderCardState = {
  order: OrderWithActivityBookingsPaymentPreview;
  phase: OrderPhaseState;
  notice: OrderNoticeState;
  bookingStates: BookingDisplayState[];
  isFinalizing: boolean;
  shouldPoll: boolean;
  hasActiveCountdown: boolean;
  pendingApprovalCount: number;
  pendingApprovalSummary: string | null;
  countdown: CountdownState;
};

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function getPendingApprovalBookings(
  order: OrderWithActivityBookingsPaymentPreview,
) {
  return order.activity_bookings.filter(
    (booking) => booking.status === "pending_approval",
  );
}

function getPendingApprovalDeadlineAt(
  order: OrderWithActivityBookingsPaymentPreview,
): string | null {
  const deadlines = getPendingApprovalBookings(order)
    .map((booking) => booking.approval_deadline_at)
    .filter((deadline): deadline is string => typeof deadline === "string");

  if (deadlines.length === 0) {
    return null;
  }

  deadlines.sort((left, right) => left.localeCompare(right));
  return deadlines[0] ?? null;
}

export function getCountdownState(
  deadlineAt: string | null,
  now: number,
): CountdownState {
  if (!deadlineAt) {
    return { kind: "hidden" };
  }

  const deadlineMs = new Date(deadlineAt).getTime();
  if (Number.isNaN(deadlineMs)) {
    return { kind: "hidden" };
  }

  const remainingMs = deadlineMs - now;
  if (remainingMs <= 0) {
    return {
      kind: "expired",
      deadlineAt,
      message: "Vendor response window closed. Waiting for final update.",
    };
  }

  return {
    kind: "active",
    deadlineAt,
    remainingMs,
    message: "Vendor response window closes in",
  };
}

export function isOrderFinalizing(
  order: OrderWithActivityBookingsPaymentPreview,
): boolean {
  return (
    order.activity_bookings.length === 0 &&
    (order.status === "awaiting_payment" ||
      order.status === "awaiting_vendor_approval")
  );
}

export function shouldOrderPoll(
  order: OrderWithActivityBookingsPaymentPreview,
): boolean {
  if (isOrderFinalizing(order)) {
    return true;
  }

  return (
    order.status === "awaiting_vendor_approval" ||
    order.status === "payment_pending"
  );
}

export function shouldOrdersPoll(
  orders: OrderWithActivityBookingsPaymentPreview[],
): boolean {
  return orders.some((order) => shouldOrderPoll(order));
}

function getOrderPhaseState(
  order: OrderWithActivityBookingsPaymentPreview,
): OrderPhaseState {
  if (isOrderFinalizing(order)) {
    return {
      kind: "finalizing",
      label: "Finalizing request",
      tone: "sky",
    };
  }

  switch (order.status) {
    case "awaiting_vendor_approval":
      return {
        kind: "vendor_review",
        label: "Waiting for vendor review",
        tone: "amber",
      };
    case "payment_pending":
      return {
        kind: "payment_processing",
        label: "Charging saved payment method",
        tone: "sky",
      };
    case "paid":
      return {
        kind: "payment_complete",
        label: "Payment complete",
        tone: "emerald",
      };
    case "failed":
      return {
        kind: "payment_failed",
        label: "Payment failed",
        tone: "rose",
      };
    case "reconciliation_required":
      return {
        kind: "support_review",
        label: "Needs support review",
        tone: "rose",
      };
    case "declined":
    case "expired":
    case "cancelled":
      return {
        kind: "no_payment_collected",
        label: "No payment collected",
        tone: "slate",
      };
    case "awaiting_payment":
    default:
      return {
        kind: "finalizing",
        label: "Finalizing request",
        tone: "sky",
      };
  }
}

function getNoticeTone(
  order: OrderWithActivityBookingsPaymentPreview,
): UiTone {
  const statusNotice = getOrderStatusNotice(order);

  if (statusNotice?.tone === "success") {
    return "emerald";
  }
  if (statusNotice?.tone === "error") {
    return "rose";
  }
  if (statusNotice?.tone === "warning") {
    return "amber";
  }

  return getOrderPhaseState(order).tone;
}

function getOrderPaymentLabel(
  order: OrderWithActivityBookingsPaymentPreview,
): string {
  if (isOrderFinalizing(order) || order.status === "awaiting_vendor_approval") {
    return "No charge yet. Your saved payment method is on file only.";
  }

  switch (order.status) {
    case "payment_pending":
      return "Charge in progress for confirmed bookings.";
    case "paid":
      return "Charge captured successfully for confirmed bookings.";
    case "failed":
      return order.payment_summary?.show_contact_support
        ? "Charge could not be completed after the final retry."
        : "Charge failed for the confirmed bookings.";
    case "reconciliation_required":
      return "Charge result needs manual review before this order can close.";
    case "declined":
    case "expired":
    case "cancelled":
      return "No payment was collected for this order.";
    case "awaiting_payment":
    default:
      return "Payment method sync is still being finalized.";
  }
}

function getOrderNextStepLabel(
  order: OrderWithActivityBookingsPaymentPreview,
): string {
  if (isOrderFinalizing(order)) {
    return "We are still attaching booking details to this order. Refresh is automatic.";
  }

  switch (order.status) {
    case "awaiting_vendor_approval":
      return "We will charge only the confirmed bookings after every vendor responds.";
    case "payment_pending":
      return "We will update this order automatically when Stripe finishes processing.";
    case "paid":
      return order.payment_summary?.receipt_url
        ? "Use the receipt link below for your records."
        : "This order is complete.";
    case "failed":
      return order.payment_summary?.show_contact_support
        ? "Contact support to finish the confirmed bookings on this order."
        : "Update your payment method to retry the confirmed bookings.";
    case "reconciliation_required":
      return "Contact support so we can review the payment result.";
    case "declined":
    case "expired":
    case "cancelled":
      return "Nothing else is due for this order.";
    case "awaiting_payment":
    default:
      return "We will keep this page updated as the request is created.";
  }
}

function getOrderNoticeState(
  order: OrderWithActivityBookingsPaymentPreview,
): OrderNoticeState {
  const statusNotice = getOrderStatusNotice(order);

  return {
    tone: getNoticeTone(order),
    title: statusNotice?.title ?? getOrderPhaseState(order).label,
    message:
      statusNotice?.message ??
      "Review the latest booking and payment status for this order below.",
    paymentLabel: getOrderPaymentLabel(order),
    nextStepLabel: getOrderNextStepLabel(order),
    failureMessage: statusNotice?.failureMessage ?? null,
    actions: {
      receiptUrl: statusNotice?.receiptUrl ?? null,
      canRetry: statusNotice?.canRetry ?? false,
      showContactSupport: statusNotice?.showContactSupport ?? false,
    },
  };
}

function getBookingStatusState(
  booking: ActivityBookingWithPreview,
  order: OrderWithActivityBookingsPaymentPreview,
  now: number,
): Omit<BookingDisplayState, "booking"> {
  const countdown =
    booking.status === "pending_approval"
      ? getCountdownState(booking.approval_deadline_at, now)
      : { kind: "hidden" as const };

  switch (booking.status) {
    case "pending_approval":
      return {
        statusLabel: "Pending approval",
        tone: "amber",
        detail:
          countdown.kind === "expired"
            ? countdown.message
            : "Awaiting the vendor decision for this booking.",
        countdown,
      };
    case "confirmed":
      return {
        statusLabel: "Confirmed",
        tone: "emerald",
        detail:
          order.status === "paid"
            ? "Vendor confirmed this booking and payment completed successfully."
            : order.status === "payment_pending"
              ? "Vendor confirmed this booking. The charge is now processing."
              : order.status === "failed"
                ? "Vendor confirmed this booking, but payment has not completed yet."
                : order.status === "reconciliation_required"
                  ? "Vendor confirmed this booking, but the payment result needs manual review."
                  : "Vendor confirmed this booking. We will charge it after the remaining bookings are resolved.",
        countdown,
      };
    case "declined":
      return {
        statusLabel: "Declined",
        tone: "rose",
        detail: "Vendor declined this booking. It will not be charged.",
        countdown,
      };
    case "expired":
      return {
        statusLabel: "Expired",
        tone: "rose",
        detail:
          "This booking expired after the vendor response window closed. It will not be charged.",
        countdown,
      };
    case "cancelled":
      return {
        statusLabel: "Cancelled",
        tone: "slate",
        detail: "This booking was cancelled. It will not be charged.",
        countdown,
      };
    default:
      return {
        statusLabel: "Updated",
        tone: "slate",
        detail: "Review this booking for the latest status.",
        countdown,
      };
  }
}

export function getOrderCardState(
  order: OrderWithActivityBookingsPaymentPreview,
  now: number,
): OrderCardState {
  const pendingApprovalCount = getPendingApprovalBookings(order).length;
  const countdown = getCountdownState(getPendingApprovalDeadlineAt(order), now);
  const bookingStates = order.activity_bookings.map((booking) => ({
    booking,
    ...getBookingStatusState(booking, order, now),
  }));

  return {
    order,
    phase: getOrderPhaseState(order),
    notice: getOrderNoticeState(order),
    bookingStates,
    isFinalizing: isOrderFinalizing(order),
    shouldPoll: shouldOrderPoll(order),
    hasActiveCountdown: bookingStates.some(
      (bookingState) => bookingState.countdown.kind === "active",
    ),
    pendingApprovalCount,
    pendingApprovalSummary:
      pendingApprovalCount > 1
        ? `${pendingApprovalCount} ${pluralize(
            pendingApprovalCount,
            "booking is",
            "bookings are",
          )} still under review`
        : null,
    countdown,
  };
}
