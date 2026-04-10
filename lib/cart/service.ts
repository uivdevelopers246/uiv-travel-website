import type { SupabaseClient } from "@supabase/supabase-js";
import { getActivityById } from "@/lib/activities/service";
import { sumConfirmedParticipantsBySlotIds } from "@/lib/slots/service";
import type { Database } from "@/supabase/types/database";
import { CART_LINE_TYPE_ACTIVITY } from "@/lib/cart/constants";
import type {
  AddOrMergeActivityLineInput,
  CartLine,
  CartLineWithPreview,
  UpdateCartLineParticipantsInput,
} from "@/lib/cart/types";

/** Wraps upstream errors so logs and API mapping identify which operation failed. */
function cartServiceError(
  operationDescription: string,
  cause?: { message?: string } | null,
): Error {
  const detail =
    cause && typeof cause.message === "string" && cause.message.trim() !== ""
      ? cause.message.trim()
      : "The database did not return a more specific message.";
  return new Error(`${operationDescription}: ${detail}`);
}

/**
 * Converts list `price_per_person` (USD) to integer cents for cart snapshots.
 * @throws Error with message `Activity price is not set` when null or non-finite.
 */
export function pricePerPersonUsdToCents(
  pricePerPerson: number | null | undefined,
): number {
  if (pricePerPerson == null || !Number.isFinite(Number(pricePerPerson))) {
    throw new Error("Activity price is not set");
  }
  const cents = Math.round(Number(pricePerPerson) * 100);
  if (!Number.isFinite(cents) || cents < 0) {
    throw new Error("Activity price is not set");
  }
  return cents;
}

function assertPositiveInteger(
  value: number,
  label: string,
): asserts value is number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

/** Snapshot math for MVP activity lines; checkout may re-validate totals. */
function buildActivityLineSnapshots(
  unitPriceCents: number,
  participants: number,
): Pick<
  CartLine,
  | "unit_price_cents"
  | "line_subtotal_cents"
  | "line_discount_cents"
  | "line_total_cents"
> {
  const line_subtotal_cents = unitPriceCents * participants;
  return {
    unit_price_cents: unitPriceCents,
    line_subtotal_cents,
    line_discount_cents: 0,
    line_total_cents: line_subtotal_cents,
  };
}

/**
 * Enforces remaining capacity vs **confirmed** bookings only.
 * Cart lines do not reserve inventory; checkout remains the final gate.
 */
function assertWithinRemainingCapacity(
  maxCapacity: number,
  confirmedBooked: number,
  requestedParticipants: number,
): void {
  const remaining = maxCapacity - confirmedBooked;
  if (requestedParticipants > remaining) {
    throw new Error("Not enough spots left for this time slot");
  }
}

async function requireAuthUserId(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthorized");
  }
  return user.id;
}

type SlotRow = Database["public"]["Tables"]["availability_slots"]["Row"];

async function fetchSlotForCartOrThrow(
  supabase: SupabaseClient<Database>,
  slotId: string,
): Promise<SlotRow> {
  const { data, error } = await supabase
    .from("availability_slots")
    .select("*")
    .eq("id", slotId)
    .maybeSingle();

  if (error) {
    throw cartServiceError("Could not load availability slot", error);
  }
  if (!data) {
    throw new Error("Slot not found");
  }
  if (data.is_cancelled) {
    throw new Error("This slot is no longer available");
  }
  return data;
}

async function findExistingActivityLineForSlot(
  supabase: SupabaseClient<Database>,
  slotId: string,
): Promise<CartLine | null> {
  const { data, error } = await supabase
    .from("cart_lines")
    .select("*")
    .eq("slot_id", slotId)
    .eq("line_type", CART_LINE_TYPE_ACTIVITY)
    .maybeSingle();

  if (error) {
    throw cartServiceError("Could not load cart line for slot", error);
  }
  return data;
}

export async function listCartLines(
  supabase: SupabaseClient<Database>,
): Promise<CartLine[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("cart_lines")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw cartServiceError("Could not list cart lines", error);
  }
  return (data ?? []) as CartLine[];
}

export async function listCartLinesWithPreview(
  supabase: SupabaseClient<Database>,
): Promise<CartLineWithPreview[]> {
  const lines = await listCartLines(supabase);
  if (lines.length === 0) {
    return [];
  }

  const slotIds = [
    ...new Set(
      lines
        .map((l) => l.slot_id)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];

  if (slotIds.length === 0) {
    return lines.map((line) => ({
      ...line,
      activity_title: "",
      slot_starts_at: "",
      slot_ends_at: "",
      max_capacity: 0,
      booked_participants: 0,
      remaining_capacity: 0,
    }));
  }

  const { data: slots, error: slotsError } = await supabase
    .from("availability_slots")
    .select("id, activity_id, starts_at, ends_at, max_capacity")
    .in("id", slotIds);

  if (slotsError) {
    throw cartServiceError("Could not load slot details for cart", slotsError);
  }

  const slotMap = new Map((slots ?? []).map((s) => [s.id, s]));
  const activityIds = [
    ...new Set((slots ?? []).map((s) => s.activity_id)),
  ];

  const titleByActivityId = new Map<string, string>();
  if (activityIds.length > 0) {
    const { data: activities, error: actError } = await supabase
      .from("activities")
      .select("id, title")
      .eq("status", "published")
      .in("id", activityIds);

    if (actError) {
      throw cartServiceError("Could not load activities for cart", actError);
    }
    for (const a of activities ?? []) {
      titleByActivityId.set(a.id, a.title);
    }
  }

  const bookedMap = await sumConfirmedParticipantsBySlotIds(
    supabase,
    slotIds,
  );

  return lines.map((line): CartLineWithPreview => {
    const slot = line.slot_id ? slotMap.get(line.slot_id) : undefined;
    const booked = line.slot_id ? (bookedMap.get(line.slot_id) ?? 0) : 0;
    const maxCap = slot?.max_capacity ?? 0;
    const remaining = Math.max(0, maxCap - booked);
    const activityTitle =
      slot != null ? (titleByActivityId.get(slot.activity_id) ?? "") : "";

    return {
      ...line,
      activity_title: activityTitle,
      slot_starts_at: slot?.starts_at ?? "",
      slot_ends_at: slot?.ends_at ?? "",
      max_capacity: maxCap,
      booked_participants: booked,
      remaining_capacity: remaining,
    };
  });
}

export async function addOrMergeActivityLine(
  supabase: SupabaseClient<Database>,
  input: AddOrMergeActivityLineInput,
): Promise<CartLine> {
  const userId = await requireAuthUserId(supabase);
  assertPositiveInteger(input.participants, "participants");

  const slot = await fetchSlotForCartOrThrow(supabase, input.slot_id);

  const activity = await getActivityById(supabase, slot.activity_id);
  if (!activity) {
    throw new Error("Activity is not available for booking");
  }

  const unitPriceCents = pricePerPersonUsdToCents(activity.price_per_person);

  const bookedMap = await sumConfirmedParticipantsBySlotIds(supabase, [
    input.slot_id,
  ]);
  const confirmedBooked = bookedMap.get(input.slot_id) ?? 0;

  const existing = await findExistingActivityLineForSlot(
    supabase,
    input.slot_id,
  );
  const priorParticipants = existing?.participants ?? 0;
  const newTotal = priorParticipants + input.participants;

  assertPositiveInteger(newTotal, "participants");
  assertWithinRemainingCapacity(
    slot.max_capacity,
    confirmedBooked,
    newTotal,
  );

  const snapshots = buildActivityLineSnapshots(unitPriceCents, newTotal);

  if (!existing) {
    const { data, error } = await supabase
      .from("cart_lines")
      .insert({
        user_id: userId,
        line_type: CART_LINE_TYPE_ACTIVITY,
        slot_id: input.slot_id,
        participants: newTotal,
        ...snapshots,
      })
      .select("*")
      .single();

    if (error) {
      throw cartServiceError("Could not add cart line", error);
    }
    return data as CartLine;
  }

  const { data: updated, error: updateError } = await supabase
    .from("cart_lines")
    .update({
      participants: newTotal,
      ...snapshots,
    })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (updateError) {
    throw cartServiceError("Could not update cart line", updateError);
  }
  return updated as CartLine;
}

export async function updateCartLineParticipants(
  supabase: SupabaseClient<Database>,
  input: UpdateCartLineParticipantsInput,
): Promise<CartLine> {
  await requireAuthUserId(supabase);
  assertPositiveInteger(input.participants, "participants");

  const { data: line, error: lineError } = await supabase
    .from("cart_lines")
    .select("*")
    .eq("id", input.cart_line_id)
    .maybeSingle();

  if (lineError) {
    throw cartServiceError("Could not load cart line", lineError);
  }
  if (!line) {
    throw new Error("Cart line not found");
  }
  if (line.line_type !== CART_LINE_TYPE_ACTIVITY) {
    throw new Error("Only activity cart lines can be updated");
  }
  if (!line.slot_id) {
    throw new Error("Cart line is missing a slot");
  }

  const slot = await fetchSlotForCartOrThrow(supabase, line.slot_id);

  const activity = await getActivityById(supabase, slot.activity_id);
  if (!activity) {
    throw new Error("Activity is not available for booking");
  }

  const unitPriceCents = pricePerPersonUsdToCents(activity.price_per_person);

  const bookedMap = await sumConfirmedParticipantsBySlotIds(supabase, [
    line.slot_id,
  ]);
  const confirmedBooked = bookedMap.get(line.slot_id) ?? 0;

  assertWithinRemainingCapacity(
    slot.max_capacity,
    confirmedBooked,
    input.participants,
  );

  const snapshots = buildActivityLineSnapshots(
    unitPriceCents,
    input.participants,
  );

  const { data: updated, error: updateError } = await supabase
    .from("cart_lines")
    .update({
      participants: input.participants,
      ...snapshots,
    })
    .eq("id", input.cart_line_id)
    .select("*")
    .single();

  if (updateError) {
    throw cartServiceError("Could not update cart line", updateError);
  }
  return updated as CartLine;
}

export async function removeCartLine(
  supabase: SupabaseClient<Database>,
  cartLineId: string,
): Promise<void> {
  await requireAuthUserId(supabase);

  const { data, error } = await supabase
    .from("cart_lines")
    .delete()
    .eq("id", cartLineId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw cartServiceError("Could not remove cart line", error);
  }
  if (!data) {
    throw new Error("Cart line not found");
  }
}
