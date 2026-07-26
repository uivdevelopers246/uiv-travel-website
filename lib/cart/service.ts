import type { SupabaseClient } from "@supabase/supabase-js";
import { getActivityById } from "@/lib/activities/service";
import { getAccommodationById } from "@/lib/accommodations/service";
import { slotPlatformParticipantsBookedBySlotIds } from "@/lib/slots/service";
import type { Database } from "@/supabase/types/database";
import {
  CART_LINE_TYPE_ACTIVITY,
  CART_LINE_TYPE_ACCOMMODATION,
} from "@/lib/cart/constants";
import type {
  AddOrMergeActivityLineInput,
  AddOrMergeAccommodationLineInput,
  CartLine,
  CartLineWithPreview,
  UpdateCartLineGuestsInput,
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

/**
 * Converts listing `price_min_usd` (USD per night) to integer cents for stay snapshots.
 * @throws Error with message `Accommodation price is not set` when null or non-finite.
 */
export function priceMinUsdToCents(
  priceMinUsd: number | null | undefined,
): number {
  if (priceMinUsd == null || !Number.isFinite(Number(priceMinUsd))) {
    throw new Error("Accommodation price is not set");
  }
  const cents = Math.round(Number(priceMinUsd) * 100);
  if (!Number.isFinite(cents) || cents < 0) {
    throw new Error("Accommodation price is not set");
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

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC calendar date as `YYYY-MM-DD` (date-only comparisons, no local TZ skew). */
export function utcDateOnlyString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Validates `YYYY-MM-DD` stay window: check_out > check_in, check_in not before today (UTC).
 * @returns nights = check_out − check_in (integer days, ≥ 1).
 */
export function parseAndValidateStayDates(
  checkIn: string,
  checkOut: string,
  now: Date = new Date(),
): { check_in: string; check_out: string; nights: number } {
  if (typeof checkIn !== "string" || !DATE_ONLY_RE.test(checkIn)) {
    throw new Error("Invalid check_in date");
  }
  if (typeof checkOut !== "string" || !DATE_ONLY_RE.test(checkOut)) {
    throw new Error("Invalid check_out date");
  }

  const inMatch = DATE_ONLY_RE.exec(checkIn)!;
  const outMatch = DATE_ONLY_RE.exec(checkOut)!;
  const inUtc = Date.UTC(
    Number(inMatch[1]),
    Number(inMatch[2]) - 1,
    Number(inMatch[3]),
  );
  const outUtc = Date.UTC(
    Number(outMatch[1]),
    Number(outMatch[2]) - 1,
    Number(outMatch[3]),
  );
  if (!Number.isFinite(inUtc) || !Number.isFinite(outUtc)) {
    throw new Error("Invalid stay dates");
  }

  const nights = Math.round((outUtc - inUtc) / 86_400_000);
  if (nights < 1) {
    throw new Error("check_out must be after check_in");
  }

  const today = utcDateOnlyString(now);
  if (checkIn < today) {
    throw new Error("check_in must not be in the past");
  }

  return { check_in: checkIn, check_out: checkOut, nights };
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

/** Snapshot math for MVP stay lines: unit × nights; guests do not multiply price. */
function buildAccommodationLineSnapshots(
  unitPriceCents: number,
  nights: number,
): Pick<
  CartLine,
  | "unit_price_cents"
  | "line_subtotal_cents"
  | "line_discount_cents"
  | "line_total_cents"
> {
  const line_subtotal_cents = unitPriceCents * nights;
  return {
    unit_price_cents: unitPriceCents,
    line_subtotal_cents,
    line_discount_cents: 0,
    line_total_cents: line_subtotal_cents,
  };
}

/**
 * Remaining = max_capacity − off_platform_participants − platform bookings
 * (confirmed + non-expired pending_approval). Checkout RPC re-validates.
 */
function assertWithinRemainingCapacity(
  maxCapacity: number,
  offPlatformParticipants: number,
  platformBooked: number,
  requestedParticipants: number,
): void {
  const remaining = maxCapacity - offPlatformParticipants - platformBooked;
  if (requestedParticipants > remaining) {
    throw new Error("Not enough spots left for this time slot");
  }
}

/**
 * When `max_guest_capacity` is set, reject over capacity; when null, honor system.
 */
function assertGuestsWithinCapacity(
  guests: number,
  maxGuestCapacity: number | null | undefined,
): void {
  if (
    maxGuestCapacity != null &&
    Number.isFinite(maxGuestCapacity) &&
    guests > maxGuestCapacity
  ) {
    throw new Error("Guest count exceeds accommodation capacity");
  }
}

/**
 * Soft hold via `accommodation_stay_is_held` (confirmed or non-expired pending_approval).
 * @throws when dates overlap a holding booking.
 */
async function assertStayDatesAvailable(
  supabase: SupabaseClient<Database>,
  accommodationId: string,
  checkIn: string,
  checkOut: string,
): Promise<void> {
  const held = await accommodationStayIsHeld(
    supabase,
    accommodationId,
    checkIn,
    checkOut,
  );
  if (held) {
    throw new Error("These stay dates are not available");
  }
}

/**
 * Soft overlap check: true if a holding booking overlaps `[check_in, check_out)`.
 * Uses SECURITY DEFINER RPC so other buyers' holds are visible under RLS.
 */
export async function accommodationStayIsHeld(
  supabase: SupabaseClient<Database>,
  accommodationId: string,
  checkIn: string,
  checkOut: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("accommodation_stay_is_held", {
    p_accommodation_id: accommodationId,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });

  if (error) {
    throw cartServiceError("Could not check stay availability", error);
  }
  return data === true;
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

async function findExistingAccommodationLine(
  supabase: SupabaseClient<Database>,
  accommodationId: string,
  checkIn: string,
  checkOut: string,
): Promise<CartLine | null> {
  const { data, error } = await supabase
    .from("cart_lines")
    .select("*")
    .eq("accommodation_id", accommodationId)
    .eq("check_in", checkIn)
    .eq("check_out", checkOut)
    .eq("line_type", CART_LINE_TYPE_ACCOMMODATION)
    .maybeSingle();

  if (error) {
    throw cartServiceError("Could not load cart line for stay", error);
  }
  return data;
}

function emptyActivityPreviewFields(): Pick<
  CartLineWithPreview,
  | "activity_title"
  | "activity_image_url"
  | "slot_starts_at"
  | "slot_ends_at"
  | "max_capacity"
  | "off_platform_participants"
  | "booked_participants"
  | "remaining_capacity"
> {
  return {
    activity_title: "",
    activity_image_url: null,
    slot_starts_at: "",
    slot_ends_at: "",
    max_capacity: 0,
    off_platform_participants: 0,
    booked_participants: 0,
    remaining_capacity: 0,
  };
}

function emptyStayPreviewFields(): Pick<
  CartLineWithPreview,
  | "accommodation_name"
  | "accommodation_image_url"
  | "nights"
  | "max_guest_capacity"
  | "stay_dates_available"
> {
  return {
    accommodation_name: "",
    accommodation_image_url: null,
    nights: 0,
    max_guest_capacity: null,
    stay_dates_available: false,
  };
}

/** Nights from stored stay dates; 0 when missing/invalid (preview only). */
function nightsFromStayDates(
  checkIn: string | null,
  checkOut: string | null,
): number {
  if (!checkIn || !checkOut) return 0;
  const inMatch = DATE_ONLY_RE.exec(checkIn);
  const outMatch = DATE_ONLY_RE.exec(checkOut);
  if (!inMatch || !outMatch) return 0;
  const inUtc = Date.UTC(
    Number(inMatch[1]),
    Number(inMatch[2]) - 1,
    Number(inMatch[3]),
  );
  const outUtc = Date.UTC(
    Number(outMatch[1]),
    Number(outMatch[2]) - 1,
    Number(outMatch[3]),
  );
  const nights = Math.round((outUtc - inUtc) / 86_400_000);
  return nights > 0 ? nights : 0;
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
        .filter((l) => l.line_type === CART_LINE_TYPE_ACTIVITY)
        .map((l) => l.slot_id)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];

  const accommodationIds = [
    ...new Set(
      lines
        .filter((l) => l.line_type === CART_LINE_TYPE_ACCOMMODATION)
        .map((l) => l.accommodation_id)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];

  const slotMap = new Map<
    string,
    {
      id: string;
      activity_id: string;
      starts_at: string;
      ends_at: string;
      max_capacity: number;
      off_platform_participants: number;
    }
  >();
  const activityPreviewById = new Map<
    string,
    { title: string; image_url: string | null }
  >();
  let bookedMap = new Map<string, number>();

  if (slotIds.length > 0) {
    const { data: slots, error: slotsError } = await supabase
      .from("availability_slots")
      .select(
        "id, activity_id, starts_at, ends_at, max_capacity, off_platform_participants",
      )
      .in("id", slotIds);

    if (slotsError) {
      throw cartServiceError("Could not load slot details for cart", slotsError);
    }

    for (const s of slots ?? []) {
      slotMap.set(s.id, s);
    }

    const activityIds = [
      ...new Set((slots ?? []).map((s) => s.activity_id)),
    ];

    if (activityIds.length > 0) {
      const { data: activities, error: actError } = await supabase
        .from("activities")
        .select("id, title, image_url")
        .eq("status", "published")
        .in("id", activityIds);

      if (actError) {
        throw cartServiceError("Could not load activities for cart", actError);
      }
      for (const a of activities ?? []) {
        activityPreviewById.set(a.id, {
          title: a.title,
          image_url: a.image_url,
        });
      }
    }

    bookedMap = await slotPlatformParticipantsBookedBySlotIds(
      supabase,
      slotIds,
    );
  }

  const accommodationPreviewById = new Map<
    string,
    {
      name: string;
      image_url: string | null;
      max_guest_capacity: number | null;
    }
  >();

  if (accommodationIds.length > 0) {
    const { data: accommodations, error: accError } = await supabase
      .from("accommodations")
      .select("id, name, image_url, max_guest_capacity")
      .eq("status", "published")
      .in("id", accommodationIds);

    if (accError) {
      throw cartServiceError(
        "Could not load accommodations for cart",
        accError,
      );
    }
    for (const a of accommodations ?? []) {
      accommodationPreviewById.set(a.id, {
        name: a.name,
        image_url: a.image_url,
        max_guest_capacity: a.max_guest_capacity,
      });
    }
  }

  const stayAvailabilityByLineId = new Map<string, boolean>();
  await Promise.all(
    lines
      .filter(
        (l) =>
          l.line_type === CART_LINE_TYPE_ACCOMMODATION &&
          l.accommodation_id &&
          l.check_in &&
          l.check_out,
      )
      .map(async (l) => {
        const held = await accommodationStayIsHeld(
          supabase,
          l.accommodation_id!,
          l.check_in!,
          l.check_out!,
        );
        stayAvailabilityByLineId.set(l.id, !held);
      }),
  );

  return lines.map((line): CartLineWithPreview => {
    if (line.line_type === CART_LINE_TYPE_ACCOMMODATION) {
      const preview =
        line.accommodation_id != null
          ? accommodationPreviewById.get(line.accommodation_id)
          : undefined;
      return {
        ...line,
        ...emptyActivityPreviewFields(),
        accommodation_name: preview?.name ?? "",
        accommodation_image_url: preview?.image_url ?? null,
        nights: nightsFromStayDates(line.check_in, line.check_out),
        max_guest_capacity: preview?.max_guest_capacity ?? null,
        stay_dates_available: stayAvailabilityByLineId.get(line.id) ?? false,
      };
    }

    const slot = line.slot_id ? slotMap.get(line.slot_id) : undefined;
    const booked = line.slot_id ? (bookedMap.get(line.slot_id) ?? 0) : 0;
    const maxCap = slot?.max_capacity ?? 0;
    const off = slot?.off_platform_participants ?? 0;
    const remaining = Math.max(0, maxCap - off - booked);
    const activityPreview =
      slot != null ? activityPreviewById.get(slot.activity_id) : undefined;

    return {
      ...line,
      activity_title: activityPreview?.title ?? "",
      activity_image_url: activityPreview?.image_url ?? null,
      slot_starts_at: slot?.starts_at ?? "",
      slot_ends_at: slot?.ends_at ?? "",
      max_capacity: maxCap,
      off_platform_participants: off,
      booked_participants: booked,
      remaining_capacity: remaining,
      ...emptyStayPreviewFields(),
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

  const bookedMap = await slotPlatformParticipantsBookedBySlotIds(supabase, [
    input.slot_id,
  ]);
  const platformBooked = bookedMap.get(input.slot_id) ?? 0;
  const offPlatform = slot.off_platform_participants ?? 0;

  const existing = await findExistingActivityLineForSlot(
    supabase,
    input.slot_id,
  );
  const priorParticipants = existing?.participants ?? 0;
  const newTotal = priorParticipants + input.participants;

  assertPositiveInteger(newTotal, "participants");
  assertWithinRemainingCapacity(
    slot.max_capacity,
    offPlatform,
    platformBooked,
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

/**
 * Add or merge an accommodation stay line.
 * Merge key: `(user_id, accommodation_id, check_in, check_out)`.
 * Guests are an absolute set (not a delta); money = current nightly rate × nights.
 */
export async function addOrMergeAccommodationLine(
  supabase: SupabaseClient<Database>,
  input: AddOrMergeAccommodationLineInput,
  options?: { now?: Date },
): Promise<CartLine> {
  const userId = await requireAuthUserId(supabase);
  assertPositiveInteger(input.guests, "guests");

  const { check_in, check_out, nights } = parseAndValidateStayDates(
    input.check_in,
    input.check_out,
    options?.now,
  );

  const accommodation = await getAccommodationById(
    supabase,
    input.accommodation_id,
  );
  if (!accommodation) {
    throw new Error("Accommodation is not available for booking");
  }

  const unitPriceCents = priceMinUsdToCents(accommodation.price_min_usd);
  await assertStayDatesAvailable(
    supabase,
    input.accommodation_id,
    check_in,
    check_out,
  );
  assertGuestsWithinCapacity(input.guests, accommodation.max_guest_capacity);

  const existing = await findExistingAccommodationLine(
    supabase,
    input.accommodation_id,
    check_in,
    check_out,
  );

  const snapshots = buildAccommodationLineSnapshots(unitPriceCents, nights);

  if (!existing) {
    const { data, error } = await supabase
      .from("cart_lines")
      .insert({
        user_id: userId,
        line_type: CART_LINE_TYPE_ACCOMMODATION,
        accommodation_id: input.accommodation_id,
        check_in,
        check_out,
        guests: input.guests,
        slot_id: null,
        participants: null,
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
      guests: input.guests,
      slot_id: null,
      participants: null,
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

  const bookedMap = await slotPlatformParticipantsBookedBySlotIds(supabase, [
    line.slot_id,
  ]);
  const platformBooked = bookedMap.get(line.slot_id) ?? 0;
  const offPlatform = slot.off_platform_participants ?? 0;

  assertWithinRemainingCapacity(
    slot.max_capacity,
    offPlatform,
    platformBooked,
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

/**
 * Set absolute guest count on an accommodation cart line; recomputes money from
 * current listing nightly rate × nights. Rejects non-accommodation lines.
 */
export async function updateCartLineGuests(
  supabase: SupabaseClient<Database>,
  input: UpdateCartLineGuestsInput,
  options?: { now?: Date },
): Promise<CartLine> {
  await requireAuthUserId(supabase);
  assertPositiveInteger(input.guests, "guests");

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
  if (line.line_type !== CART_LINE_TYPE_ACCOMMODATION) {
    throw new Error("Only accommodation cart lines can update guests");
  }
  if (!line.accommodation_id || !line.check_in || !line.check_out) {
    throw new Error("Cart line is missing stay details");
  }

  const accommodation = await getAccommodationById(
    supabase,
    line.accommodation_id,
  );
  if (!accommodation) {
    throw new Error("Accommodation is not available for booking");
  }

  const { nights } = parseAndValidateStayDates(
    line.check_in,
    line.check_out,
    options?.now,
  );
  const unitPriceCents = priceMinUsdToCents(accommodation.price_min_usd);
  await assertStayDatesAvailable(
    supabase,
    line.accommodation_id,
    line.check_in,
    line.check_out,
  );
  assertGuestsWithinCapacity(input.guests, accommodation.max_guest_capacity);

  const snapshots = buildAccommodationLineSnapshots(unitPriceCents, nights);

  const { data: updated, error: updateError } = await supabase
    .from("cart_lines")
    .update({
      guests: input.guests,
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

/**
 * Read-only checkout gate: non-empty cart; every line must be **activity** (MVP);
 * for each line, same checks as `addOrMergeActivityLine` / `updateCartLineParticipants`
 * (slot exists and not cancelled, published activity, price set, participants within
 * remaining capacity vs confirmed bookings).
 *
 * @throws Error messages aligned with cart API mapping (`cart-route-errors.ts`).
 */
export async function validateActivityCartForCheckout(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  await requireAuthUserId(supabase);

  const lines = await listCartLines(supabase);
  if (lines.length === 0) {
    throw new Error("Cart is empty");
  }

  for (const line of lines) {
    if (line.line_type !== CART_LINE_TYPE_ACTIVITY) {
      throw new Error("Checkout is only available for activity items");
    }
  }

  const uniqueSlotIds = [
    ...new Set(
      lines
        .map((l) => l.slot_id)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];

  for (const line of lines) {
    if (!line.slot_id) {
      throw new Error("Cart line is missing a slot");
    }
    if (line.participants == null) {
      throw new Error("participants must be a positive integer");
    }
    assertPositiveInteger(line.participants, "participants");
  }

  const slotById = new Map<string, SlotRow>();
  for (const sid of uniqueSlotIds) {
    slotById.set(sid, await fetchSlotForCartOrThrow(supabase, sid));
  }

  const bookedMap = await slotPlatformParticipantsBookedBySlotIds(
    supabase,
    uniqueSlotIds,
  );

  for (const line of lines) {
    const slot = slotById.get(line.slot_id!);
    if (!slot) {
      throw new Error("Slot not found");
    }

    const activity = await getActivityById(supabase, slot.activity_id);
    if (!activity) {
      throw new Error("Activity is not available for booking");
    }

    pricePerPersonUsdToCents(activity.price_per_person);

    const platformBooked = bookedMap.get(line.slot_id!) ?? 0;
    const offPlatform = slot.off_platform_participants ?? 0;
    const participants = line.participants;
    if (participants == null) {
      throw new Error("participants must be a positive integer");
    }
    assertWithinRemainingCapacity(
      slot.max_capacity,
      offPlatform,
      platformBooked,
      participants,
    );
  }
}

/**
 * Removes all cart lines for a user. Intended for **service-role** clients after
 * successful payment (RLS bypass); do not call from user-session code for arbitrary
 * `userId` without an authorization boundary.
 */
export async function deleteAllCartLinesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("cart_lines")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw cartServiceError("Could not clear cart lines for user", error);
  }
}
