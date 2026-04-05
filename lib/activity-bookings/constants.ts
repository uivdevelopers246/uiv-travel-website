export const ACTIVITY_BOOKING_STATUSES = [
  "confirmed",
  "cancelled",
  "completed",
] as const;

export type ActivityBookingStatus = (typeof ACTIVITY_BOOKING_STATUSES)[number];
