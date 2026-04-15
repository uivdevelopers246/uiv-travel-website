import type { Database } from "@/supabase/types/database";

export type AvailabilitySlot =
  Database["public"]["Tables"]["availability_slots"]["Row"];

/** Vendor create body: `ends_at` is computed server-side from activity `duration_hours`. */
export type CreateSlotInput = {
  starts_at: string;
  max_capacity: number;
};

/** Vendor PATCH: if `starts_at` changes, `ends_at` is recomputed from activity `duration_hours`. */
export type UpdateSlotInput = {
  starts_at?: string;
  max_capacity?: number;
  /** Vendor-reported seats booked outside this platform; must satisfy platform_booked + off_platform ≤ max_capacity. */
  off_platform_participants?: number;
};

/** Public list entries after filtering to bookable slots (`remaining_capacity > 0`). */
export type PublicSlotWithCapacity = Pick<
  AvailabilitySlot,
  "id" | "activity_id" | "starts_at" | "ends_at" | "max_capacity" | "off_platform_participants"
> & {
  /** Confirmed + non-expired pending_approval on this platform. */
  booked_participants: number;
  remaining_capacity: number;
};

/** Vendor/admin manage list: full slot row plus platform headcount for the UI. */
export type ManageSlotRow = AvailabilitySlot & {
  /** Confirmed + non-expired pending_approval. */
  booked_participants: number;
};
