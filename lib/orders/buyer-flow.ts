import type { OrderWithActivityBookingsPaymentPreview } from "./types";

export type BuyerFlowMessage = {
  tone: "success" | "warning" | "error";
  message: string;
};

export type OrderStatusNotice = {
  tone: BuyerFlowMessage["tone"];
  title: string;
  message: string;
  failureMessage: string | null;
  receiptUrl: string | null;
  canRetry: boolean;
  showContactSupport: boolean;
};

export type CheckoutSuccessState =
  | {
      kind: "missing_order_id" | "order_not_found";
      title: string;
      message: string;
    }
  | {
      kind: "finalizing";
      title: string;
      message: string;
      order: OrderWithActivityBookingsPaymentPreview;
    }
  | {
      kind: "submitted";
      title: string;
      message: string;
      order: OrderWithActivityBookingsPaymentPreview;
    }
  | {
      kind: "attention";
      title: string;
      message: string;
      order: OrderWithActivityBookingsPaymentPreview;
    };

function getParamValue(
  searchParams:
    | URLSearchParams
    | Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key);
  }

  const raw = searchParams[key];
  if (Array.isArray(raw)) {
    return typeof raw[0] === "string" ? raw[0] : null;
  }

  return typeof raw === "string" ? raw : null;
}

export function getBuyerFlowMessageFromSearchParams(
  searchParams:
    | URLSearchParams
    | Record<string, string | string[] | undefined>,
): BuyerFlowMessage | null {
  const checkout = getParamValue(searchParams, "checkout");
  if (checkout === "success") {
    return {
      tone: "success",
      message:
        "Your payment method was saved and your booking request is now in vendor review.",
    };
  }
  if (checkout === "pending") {
    return {
      tone: "warning",
      message:
        "Your payment method was saved. We're still finalizing your booking request in the background.",
    };
  }

  const paymentRecovery = getParamValue(searchParams, "payment_recovery");
  if (paymentRecovery === "updated") {
    return {
      tone: "success",
      message:
        "Your payment method was updated. We'll retry the charge for any confirmed bookings.",
    };
  }
  if (paymentRecovery === "cancelled") {
    return {
      tone: "warning",
      message:
        "Payment method update was canceled. Confirmed bookings will stay unpaid until you retry.",
    };
  }

  return null;
}

export function getOrderStatusNotice(
  order: OrderWithActivityBookingsPaymentPreview,
): OrderStatusNotice | null {
  if (
    order.activity_bookings.length === 0 &&
    (order.status === "awaiting_payment" ||
      order.status === "awaiting_vendor_approval")
  ) {
    return {
      tone: "warning",
      title: "Finalizing request",
      message:
        "We're still syncing your checkout with the booking system. Your request should appear here shortly.",
      failureMessage: null,
      receiptUrl: null,
      canRetry: false,
      showContactSupport: false,
    };
  }

  switch (order.status) {
    case "awaiting_vendor_approval":
      return {
        tone: "warning",
        title: "Pending vendor review",
        message:
          "Your payment method is saved and vendors are reviewing live availability for these requests now.",
        failureMessage: null,
        receiptUrl: null,
        canRetry: false,
        showContactSupport: false,
      };
    case "payment_pending":
      return {
        tone: "warning",
        title: "Payment processing...",
        message:
          "All bookings are resolved. We're charging the saved payment method for the confirmed bookings now.",
        failureMessage: null,
        receiptUrl: null,
        canRetry: false,
        showContactSupport: false,
      };
    case "paid":
      return {
        tone: "success",
        title: "Payment complete",
        message: "Payment completed successfully for the confirmed bookings on this order.",
        failureMessage: null,
        receiptUrl: order.payment_summary?.receipt_url ?? null,
        canRetry: false,
        showContactSupport: false,
      };
    case "failed":
      return {
        tone: "error",
        title: "Payment failed",
        message:
          order.payment_summary?.show_contact_support
            ? "We couldn't complete the retry for this order. Contact support to finish the booking."
            : "We couldn't complete the charge for the confirmed bookings. Update your payment method to retry.",
        failureMessage: order.payment_summary?.failure_message ?? null,
        receiptUrl: null,
        canRetry:
          order.payment_summary?.can_retry_with_payment_method_update ?? false,
        showContactSupport:
          order.payment_summary?.show_contact_support ?? false,
      };
    case "reconciliation_required":
      return {
        tone: "error",
        title: "Payment needs review",
        message:
          "We received a settlement result that needs manual review before this order can be closed.",
        failureMessage: null,
        receiptUrl: null,
        canRetry: false,
        showContactSupport: true,
      };
    case "declined":
    case "expired":
    case "cancelled":
      return {
        tone: "warning",
        title: "No payment collected",
        message:
          "This order finished without any confirmed bookings, so no payment was charged.",
        failureMessage: null,
        receiptUrl: null,
        canRetry: false,
        showContactSupport: false,
      };
    default:
      return null;
  }
}

export function getCheckoutSuccessState(
  orderId: string | null,
  order: OrderWithActivityBookingsPaymentPreview | null,
): CheckoutSuccessState {
  if (!orderId) {
    return {
      kind: "missing_order_id",
      title: "We couldn't verify this checkout return",
      message:
        "The payment method may still have been saved, but this page doesn't include the order reference needed to confirm it.",
    };
  }

  if (!order) {
    return {
      kind: "order_not_found",
      title: "We couldn't find that order yet",
      message:
        "The checkout return reached us, but the matching order is not available in your account right now.",
    };
  }

  if (
    order.status === "failed" ||
    order.status === "reconciliation_required" ||
    order.status === "cancelled" ||
    order.status === "declined" ||
    order.status === "expired"
  ) {
    return {
      kind: "attention",
      title:
        order.status === "reconciliation_required"
          ? "Payment needs review"
          : "Your booking request needs attention",
      message:
        order.status === "reconciliation_required"
          ? "We received a payment result that needs manual review before this order can be closed."
          : "We couldn't finish this booking request automatically. Review the order details below for the next step.",
      order,
    };
  }

  if (
    order.status === "awaiting_payment" ||
    order.activity_bookings.length === 0
  ) {
    return {
      kind: "finalizing",
      title: "Finalizing your booking request",
      message:
        "Your payment method was saved in Stripe. We're still creating the booking items and syncing them to your account.",
      order,
    };
  }

  return {
    kind: "submitted",
    title: "Booking request submitted",
    message:
      "Your payment method is saved and the booking request is now in vendor review. We'll move you to My Bookings automatically.",
    order,
  };
}
