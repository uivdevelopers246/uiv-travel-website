import type { OrderWithActivityBookingsPreview } from "./types";

export type StatusAlert = {
  tone: "success" | "warning" | "error";
  message: string;
};

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function buildCountMessage(
  count: number,
  singular: string,
  plural: string,
): string {
  return count === 1 ? singular : `${count} ${plural}`;
}

export function collectOrderStatusAlerts(
  previousOrders: OrderWithActivityBookingsPreview[],
  nextOrders: OrderWithActivityBookingsPreview[],
): StatusAlert[] {
  const previousOrderStatusById = new Map(
    previousOrders.map((order) => [order.id, order.status]),
  );
  const previousBookingStatusById = new Map(
    previousOrders.flatMap((order) =>
      order.activity_bookings.map((booking) => [booking.id, booking.status] as const),
    ),
  );

  let confirmedCount = 0;
  let declinedCount = 0;
  let expiredCount = 0;
  let paymentCompletedCount = 0;
  let paymentFailedCount = 0;
  let reconciliationRequiredCount = 0;

  for (const order of nextOrders) {
    const previousOrderStatus = previousOrderStatusById.get(order.id);
    if (previousOrderStatus && previousOrderStatus !== order.status) {
      if (order.status === "paid") {
        paymentCompletedCount += 1;
      }
      if (order.status === "failed") {
        paymentFailedCount += 1;
      }
      if (order.status === "reconciliation_required") {
        reconciliationRequiredCount += 1;
      }
    }

    for (const booking of order.activity_bookings) {
      const previousBookingStatus = previousBookingStatusById.get(booking.id);
      if (!previousBookingStatus || previousBookingStatus === booking.status) {
        continue;
      }

      if (booking.status === "confirmed") {
        confirmedCount += 1;
      }
      if (booking.status === "declined") {
        declinedCount += 1;
      }
      if (booking.status === "expired") {
        expiredCount += 1;
      }
    }
  }

  const alerts: StatusAlert[] = [];

  if (confirmedCount > 0) {
    alerts.push({
      tone: "success",
      message: buildCountMessage(
        confirmedCount,
        "Your booking was confirmed by the vendor.",
        `${pluralize(confirmedCount, "booking was", "bookings were")} confirmed by vendors.`,
      ),
    });
  }

  if (declinedCount > 0) {
    alerts.push({
      tone: "warning",
      message: buildCountMessage(
        declinedCount,
        "A vendor declined your booking.",
        `${pluralize(declinedCount, "booking was", "bookings were")} declined by vendors.`,
      ),
    });
  }

  if (expiredCount > 0) {
    alerts.push({
      tone: "warning",
      message: buildCountMessage(
        expiredCount,
        "A booking expired after the vendor response window closed.",
        `${pluralize(expiredCount, "booking expired", "bookings expired")} after the vendor response window closed.`,
      ),
    });
  }

  if (paymentCompletedCount > 0) {
    alerts.push({
      tone: "success",
      message: buildCountMessage(
        paymentCompletedCount,
        "Payment completed successfully.",
        `${pluralize(paymentCompletedCount, "payment completed", "payments completed")} successfully.`,
      ),
    });
  }

  if (paymentFailedCount > 0) {
    alerts.push({
      tone: "error",
      message: buildCountMessage(
        paymentFailedCount,
        "Payment failed. Please retry or contact support.",
        `${pluralize(paymentFailedCount, "payment failed", "payments failed")}. Please retry or contact support.`,
      ),
    });
  }

  if (reconciliationRequiredCount > 0) {
    alerts.push({
      tone: "error",
      message: buildCountMessage(
        reconciliationRequiredCount,
        "Payment needs review. Contact support.",
        `${pluralize(reconciliationRequiredCount, "order needs", "orders need")} payment review. Contact support.`,
      ),
    });
  }

  return alerts;
}
