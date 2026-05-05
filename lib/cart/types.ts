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

/** Set absolute participant count on an existing activity line. */
export type UpdateCartLineParticipantsInput = {
  cart_line_id: string;
  participants: number;
};

/**
 * Cart line plus joined preview fields for list/detail UIs (GET `/api/cart`).
 * Capacity figures are computed at read time; checkout remains the final gate.
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
};
