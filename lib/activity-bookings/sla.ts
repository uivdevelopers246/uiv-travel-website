/** ADR-M4-C: single SLA for pending_approval; changing this does not alter existing rows' expires_at. */
export const BOOKING_APPROVAL_SLA_HOURS = 24;

export const BOOKING_APPROVAL_SLA_MS =
  BOOKING_APPROVAL_SLA_HOURS * 60 * 60 * 1000;

export function bookingPendingApprovalExpiresAtIso(now = new Date()): string {
  return new Date(now.getTime() + BOOKING_APPROVAL_SLA_MS).toISOString();
}
