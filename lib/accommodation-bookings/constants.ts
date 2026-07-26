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
