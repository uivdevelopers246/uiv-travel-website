import type { Database } from "@/supabase/types/database";

/** Row from `cart_lines`; RLS scopes reads/writes to the current user. */
export type CartLine = Database["public"]["Tables"]["cart_lines"]["Row"];

/**
 * Add or merge an activity line for a slot.
 * `participants` is a **delta**: merged rows add to the existing count.
 */
export type AddOrMergeActivityLineInput = {
  slot_id: string;
  participants: number;
};

/**
 * Add or merge an accommodation stay line.
 * Merge key: `(user_id, accommodation_id, check_in, check_out)`.
 * `guests` is an **absolute** set (not a delta): re-adding the same dates
 * replaces `guests` and recomputes money from the sum of the host's nightly rates.
 * `check_in` / `check_out` are `YYYY-MM-DD` date-only strings.
 *
 * API contract:
 * - POST `/api/cart/lines` `{ accommodation_id, check_in, check_out, guests }`
 * - PATCH `/api/cart/lines/[id]` `{ guests }`
 * - DELETE `/api/cart/lines/[id]` unchanged
 * - GET cart returns `CartLineWithPreview[]`; branch on `line_type`
 * - Checkout supports activity-only, stay-only, and mixed carts.
 */
export type AddOrMergeAccommodationLineInput = {
  accommodation_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  /** The quote the buyer reviewed; reject a changed price before saving the line. */
  expected_total_cents?: number;
};

/** Set absolute participant count on an existing activity line. */
export type UpdateCartLineParticipantsInput = {
  cart_line_id: string;
  participants: number;
};

/** Set absolute guest count on an existing accommodation line. */
export type UpdateCartLineGuestsInput = {
  cart_line_id: string;
  guests: number;
};

/**
 * Cart line plus joined preview fields for list/detail UIs (GET `/api/cart`).
 * Capacity figures are computed at read time; checkout remains the final gate.
 * Activity lines leave stay fields empty/zero; stay lines leave slot/activity
 * fields empty/zero (same pattern as today’s “no slots” fallback).
 */
export type CartLineWithPreview = CartLine & {
  activity_title: string;
  activity_image_url: string | null;
  slot_starts_at: string;
  slot_ends_at: string;
  max_capacity: number;
  /** Vendor-reported seats booked outside this platform (same slot row). */
  off_platform_participants: number;
  /** Confirmed + non-expired pending_approval on this platform. */
  booked_participants: number;
  remaining_capacity: number;
  /** Stay preview; empty for activity lines. */
  accommodation_name: string;
  accommodation_image_url: string | null;
  nights: number;
  max_guest_capacity: number | null;
  /** Soft overlap check at preview time (`confirmed` or non-expired `pending_approval`). */
  stay_dates_available: boolean;
  /** Current calendar quote for display; saved cart money changes only on explicit updates. */
  stay_nightly_prices?: { night: string; price_cents: number }[];
  stay_price_changed?: boolean;
};
