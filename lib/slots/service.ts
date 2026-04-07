import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import { getActivityById } from "@/lib/activities/service";
import {
  getCurrentUserIdOrThrow,
  getVendorIdForCurrentUser,
} from "@/lib/vendors/ownership";
import type {
  AvailabilitySlot,
  CreateSlotInput,
  ManageSlotRow,
  PublicSlotWithCapacity,
  UpdateSlotInput,
} from "./types";

function slotServiceError(
  operationDescription: string,
  cause?: { message?: string } | null,
): Error {
  const detail =
    cause && typeof cause.message === "string" && cause.message.trim() !== ""
      ? cause.message.trim()
      : "The database did not return a more specific message.";
  return new Error(`${operationDescription}: ${detail}`);
}

function validateDurationHours(
  durationHours: number | null,
): asserts durationHours is number {
  if (
    durationHours == null ||
    !Number.isFinite(durationHours) ||
    durationHours <= 0
  ) {
    throw new Error(
      "Activity duration_hours must be set and greater than zero to create or reschedule slots.",
    );
  }
}

/** Computes `ends_at` as ISO string (UTC) from slot start + activity duration. */
export function computeEndsAtIso(
  startsAtIso: string,
  durationHours: number,
): string {
  const startMs = Date.parse(startsAtIso);
  if (!Number.isFinite(startMs)) {
    throw new Error("starts_at must be a valid ISO 8601 timestamp.");
  }
  const endMs = startMs + durationHours * 60 * 60 * 1000;
  return new Date(endMs).toISOString();
}

export async function sumConfirmedParticipantsBySlotIds(
  supabase: SupabaseClient<Database>,
  slotIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (slotIds.length === 0) return map;

  const { data, error } = await supabase
    .from("activity_bookings")
    .select("slot_id, participants")
    .eq("status", "confirmed")
    .in("slot_id", slotIds);

  if (error) {
    throw slotServiceError(
      "Could not sum confirmed booking participants for slots",
      error,
    );
  }

  for (const row of data ?? []) {
    const sid = row.slot_id;
    map.set(sid, (map.get(sid) ?? 0) + row.participants);
  }

  return map;
}

export type ListPublicSlotsOptions = {
  /**
   * Clock for filtering `starts_at > now`. Defaults to `new Date()`.
   * Inject in tests for stable assertions.
   */
  now?: Date;
};

/**
 * Lists bookable upcoming slots for a **published** activity with remaining capacity.
 * Accurate `booked_participants` / `remaining_capacity` for anonymous users may require a
 * future RLS or RPC change: `activity_bookings` has no anon SELECT policy today.
 */
export async function listPublicSlotsForActivity(
  supabase: SupabaseClient<Database>,
  activityId: string,
  options?: ListPublicSlotsOptions,
): Promise<PublicSlotWithCapacity[]> {
  const activity = await getActivityById(supabase, activityId);
  if (!activity) {
    return [];
  }

  const nowIso = (options?.now ?? new Date()).toISOString();

  const { data: rows, error } = await supabase
    .from("availability_slots")
    .select("id, activity_id, starts_at, ends_at, max_capacity")
    .eq("activity_id", activityId)
    .eq("is_cancelled", false)
    .gt("starts_at", nowIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw slotServiceError("Could not list availability slots", error);
  }

  const slots = rows ?? [];
  const slotIds = slots.map((s) => s.id);
  const sums = await sumConfirmedParticipantsBySlotIds(supabase, slotIds);

  const result: PublicSlotWithCapacity[] = [];
  for (const s of slots) {
    const booked = sums.get(s.id) ?? 0;
    const remaining = s.max_capacity - booked;
    if (remaining > 0) {
      result.push({
        id: s.id,
        activity_id: s.activity_id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        max_capacity: s.max_capacity,
        booked_participants: booked,
        remaining_capacity: remaining,
      });
    }
  }

  return result;
}

export async function listManageSlotsForActivity(
  supabase: SupabaseClient<Database>,
  activityId: string,
  options?: { isAdmin?: boolean },
): Promise<ManageSlotRow[]> {
  await getCurrentUserIdOrThrow(supabase);

  const { data: activity, error: actError } = await supabase
    .from("activities")
    .select("id, vendor_id")
    .eq("id", activityId)
    .maybeSingle();

  if (actError) {
    throw slotServiceError(
      "Could not load activity for slot management",
      actError,
    );
  }
  if (!activity) {
    throw new Error("Activity not found");
  }

  if (!options?.isAdmin) {
    const vendorId = await getVendorIdForCurrentUser(supabase);
    if (activity.vendor_id !== vendorId) {
      throw new Error("Forbidden: You do not manage this activity.");
    }
  }

  const { data: slots, error } = await supabase
    .from("availability_slots")
    .select("*")
    .eq("activity_id", activityId)
    .order("starts_at", { ascending: true });

  if (error) {
    throw slotServiceError(
      "Could not list availability slots for management",
      error,
    );
  }

  const list = (slots ?? []) as AvailabilitySlot[];
  const slotIds = list.map((s) => s.id);
  const sums = await sumConfirmedParticipantsBySlotIds(supabase, slotIds);

  return list.map((s) => ({
    ...s,
    booked_participants: sums.get(s.id) ?? 0,
  }));
}

export async function createAvailabilitySlot(
  supabase: SupabaseClient<Database>,
  activityId: string,
  input: CreateSlotInput,
  options?: { isAdmin?: boolean },
): Promise<AvailabilitySlot> {
  await getCurrentUserIdOrThrow(supabase);

  const { data: activity, error: actError } = await supabase
    .from("activities")
    .select("id, vendor_id, duration_hours")
    .eq("id", activityId)
    .maybeSingle();

  if (actError) {
    throw slotServiceError(
      "Could not load activity for slot creation",
      actError,
    );
  }
  if (!activity) {
    throw new Error("Activity not found");
  }

  if (!options?.isAdmin) {
    const vendorId = await getVendorIdForCurrentUser(supabase);
    if (activity.vendor_id !== vendorId) {
      throw new Error("Forbidden: You do not manage this activity.");
    }
  }

  validateDurationHours(activity.duration_hours);

  if (!Number.isInteger(input.max_capacity) || input.max_capacity < 1) {
    throw new Error("max_capacity must be an integer of at least 1");
  }

  const ends_at = computeEndsAtIso(input.starts_at, activity.duration_hours);

  const { data, error } = await supabase
    .from("availability_slots")
    .insert({
      activity_id: activityId,
      vendor_id: activity.vendor_id,
      starts_at: input.starts_at,
      ends_at,
      max_capacity: input.max_capacity,
    })
    .select("*")
    .single();

  if (error) {
    throw slotServiceError("Could not create availability slot", error);
  }

  return data as AvailabilitySlot;
}

async function loadSlotForActivityOrThrow(
  supabase: SupabaseClient<Database>,
  activityId: string,
  slotId: string,
): Promise<AvailabilitySlot> {
  const { data, error } = await supabase
    .from("availability_slots")
    .select("*")
    .eq("id", slotId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) {
    throw slotServiceError("Could not load availability slot", error);
  }
  if (!data) {
    throw new Error("Slot not found");
  }
  return data as AvailabilitySlot;
}

async function assertVendorOrAdminCanManageSlot(
  supabase: SupabaseClient<Database>,
  slot: AvailabilitySlot,
  options?: { isAdmin?: boolean },
): Promise<void> {
  if (options?.isAdmin) {
    return;
  }
  const vendorId = await getVendorIdForCurrentUser(supabase);
  if (slot.vendor_id !== vendorId) {
    throw new Error("Forbidden: You do not manage this slot.");
  }
}

async function getConfirmedBookedParticipants(
  supabase: SupabaseClient<Database>,
  slotId: string,
): Promise<number> {
  const sums = await sumConfirmedParticipantsBySlotIds(supabase, [slotId]);
  return sums.get(slotId) ?? 0;
}

export async function updateAvailabilitySlot(
  supabase: SupabaseClient<Database>,
  activityId: string,
  slotId: string,
  input: UpdateSlotInput,
  options?: { isAdmin?: boolean },
): Promise<AvailabilitySlot> {
  await getCurrentUserIdOrThrow(supabase);

  const slot = await loadSlotForActivityOrThrow(supabase, activityId, slotId);
  await assertVendorOrAdminCanManageSlot(supabase, slot, options);

  const booked = await getConfirmedBookedParticipants(supabase, slotId);
  if (booked > 0) {
    throw new Error(
      "Cannot modify or cancel this slot because it has confirmed bookings.",
    );
  }

  const payload: Record<string, unknown> = {};

  if (input.max_capacity !== undefined) {
    if (!Number.isInteger(input.max_capacity) || input.max_capacity < 1) {
      throw new Error("max_capacity must be an integer of at least 1");
    }
    payload.max_capacity = input.max_capacity;
  }

  if (input.starts_at !== undefined) {
    const { data: activity, error: actError } = await supabase
      .from("activities")
      .select("duration_hours")
      .eq("id", activityId)
      .maybeSingle();

    if (actError) {
      throw slotServiceError(
        "Could not load activity duration for slot reschedule",
        actError,
      );
    }
    if (!activity) {
      throw new Error("Activity not found");
    }
    validateDurationHours(activity.duration_hours);
    payload.starts_at = input.starts_at;
    payload.ends_at = computeEndsAtIso(
      input.starts_at,
      activity.duration_hours,
    );
  }

  if (Object.keys(payload).length === 0) {
    return slot;
  }

  const { data, error } = await supabase
    .from("availability_slots")
    .update(payload)
    .eq("id", slotId)
    .eq("activity_id", activityId)
    .select("*")
    .single();

  if (error) {
    throw slotServiceError("Could not update availability slot", error);
  }

  return data as AvailabilitySlot;
}

export async function cancelAvailabilitySlot(
  supabase: SupabaseClient<Database>,
  activityId: string,
  slotId: string,
  options?: { isAdmin?: boolean },
): Promise<AvailabilitySlot> {
  await getCurrentUserIdOrThrow(supabase);

  const slot = await loadSlotForActivityOrThrow(supabase, activityId, slotId);
  await assertVendorOrAdminCanManageSlot(supabase, slot, options);

  const bookedCancel = await getConfirmedBookedParticipants(supabase, slotId);
  if (bookedCancel > 0) {
    throw new Error(
      "Cannot modify or cancel this slot because it has confirmed bookings.",
    );
  }

  const { data, error } = await supabase
    .from("availability_slots")
    .update({ is_cancelled: true })
    .eq("id", slotId)
    .eq("activity_id", activityId)
    .select("*")
    .single();

  if (error) {
    throw slotServiceError("Could not cancel availability slot", error);
  }

  return data as AvailabilitySlot;
}
