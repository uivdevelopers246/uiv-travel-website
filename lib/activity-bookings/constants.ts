export const ACTIVITY_BOOKING_STATUSES = [
  "confirmed",
  "cancelled",
  "completed",
  "pending_approval",
  "declined",
  "expired",
] as const;

export type ActivityBookingStatus = (typeof ACTIVITY_BOOKING_STATUSES)[number];
