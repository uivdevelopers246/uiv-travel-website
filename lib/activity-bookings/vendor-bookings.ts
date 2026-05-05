import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/types/database";
import type { ActivityBooking } from "./service";
import type { ActivityBookingStatus } from "./constants";
import { BOOKING_APPROVAL_SLA_MS } from "./sla";

type ActivityRow = Pick<
  Database["public"]["Tables"]["activities"]["Row"],
  "id" | "title"
>;

type SlotRow = Pick<
  Database["public"]["Tables"]["availability_slots"]["Row"],
  "id" | "starts_at" | "ends_at"
>;

type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name"
>;

function vendorBookingsError(
  operationDescription: string,
  cause?: { message?: string } | null,
): Error {
  const detail =
    cause && typeof cause.message === "string" && cause.message.trim() !== ""
      ? cause.message.trim()
      : "The database did not return a more specific message.";
  return new Error(`${operationDescription}: ${detail}`);
}

function getApprovalDeadlineAt(booking: ActivityBooking): string | null {
  if (booking.status !== "pending_approval") {
    return null;
  }

  if (booking.expires_at) {
    return booking.expires_at;
  }

  const createdAtMs = new Date(booking.created_at).getTime();
  if (Number.isNaN(createdAtMs)) {
    return null;
  }

  return new Date(createdAtMs + BOOKING_APPROVAL_SLA_MS).toISOString();
}

function getCustomerName(profile: ProfileRow | undefined): string {
  const displayName = profile?.display_name?.trim();
  return displayName && displayName.length > 0 ? displayName : "Guest";
}

export type VendorBookingPreview = ActivityBooking & {
  activity_title: string;
  customer_name: string;
  slot_starts_at: string;
  slot_ends_at: string;
  approval_deadline_at: string | null;
};

export type VendorBookingActivityOption = {
  id: string;
  title: string;
};

export type ListVendorBookingPreviewsOptions = {
  vendorId: string;
  activityId?: string;
  status?: ActivityBookingStatus;
  limit?: number;
  offset?: number;
};

export async function listVendorBookingActivityOptions(
  supabase: SupabaseClient<Database>,
  vendorId: string,
): Promise<VendorBookingActivityOption[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, title")
    .eq("vendor_id", vendorId)
    .order("title", { ascending: true });

  if (error) {
    throw vendorBookingsError("Could not load vendor activities", error);
  }

  return (data ?? []) as VendorBookingActivityOption[];
}

export async function listVendorBookingPreviews(
  supabase: SupabaseClient<Database>,
  options: ListVendorBookingPreviewsOptions,
): Promise<VendorBookingPreview[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  let query = supabase
    .from("activity_bookings")
    .select("*")
    .eq("vendor_id", options.vendorId);

  if (options.activityId) {
    query = query.eq("activity_id", options.activityId);
  }

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const { data: bookings, error: bookingsError } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (bookingsError) {
    throw vendorBookingsError("Could not load vendor bookings", bookingsError);
  }

  if (!bookings || bookings.length === 0) {
    return [];
  }

  const activityIds = [...new Set(bookings.map((booking) => booking.activity_id))];
  const slotIds = [...new Set(bookings.map((booking) => booking.slot_id))];
  const userIds = [...new Set(bookings.map((booking) => booking.user_id))];

  const activityMap = new Map<string, ActivityRow>();
  if (activityIds.length > 0) {
    const { data, error } = await supabase
      .from("activities")
      .select("id, title")
      .in("id", activityIds);

    if (error) {
      throw vendorBookingsError("Could not load vendor booking activities", error);
    }

    for (const activity of (data ?? []) as ActivityRow[]) {
      activityMap.set(activity.id, activity);
    }
  }

  const slotMap = new Map<string, SlotRow>();
  if (slotIds.length > 0) {
    const { data, error } = await supabase
      .from("availability_slots")
      .select("id, starts_at, ends_at")
      .in("id", slotIds);

    if (error) {
      throw vendorBookingsError("Could not load vendor booking slots", error);
    }

    for (const slot of (data ?? []) as SlotRow[]) {
      slotMap.set(slot.id, slot);
    }
  }

  const profileMap = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    if (error) {
      throw vendorBookingsError("Could not load vendor booking customers", error);
    }

    for (const profile of (data ?? []) as ProfileRow[]) {
      profileMap.set(profile.id, profile);
    }
  }

  return bookings.map((booking) => {
    const activity = activityMap.get(booking.activity_id);
    const slot = slotMap.get(booking.slot_id);
    const customer = profileMap.get(booking.user_id);

    return {
      ...booking,
      activity_title: activity?.title ?? "Activity unavailable",
      customer_name: getCustomerName(customer),
      slot_starts_at: slot?.starts_at ?? "",
      slot_ends_at: slot?.ends_at ?? "",
      approval_deadline_at: getApprovalDeadlineAt(booking),
    };
  });
}
