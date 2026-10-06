export const ACCOMMODATION_BOOKING_STATUSES = [
  "confirmed",
  "cancelled",
  "completed",
  "pending_approval",
  "declined",
  "expired",
] as const;

export type AccommodationBookingStatus =
  (typeof ACCOMMODATION_BOOKING_STATUSES)[number];

/** Matches the database payment-recovery rule for date-only stay reservations. */
export function hasStartedConfirmedStay(
  bookings: readonly { status: string; check_in: string }[],
  now = Date.now(),
): boolean {
  const today = new Date(now).toISOString().slice(0, 10);
  return bookings.some((booking) => booking.status === "confirmed" && booking.check_in < today);
}
