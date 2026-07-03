import type { SupabaseClient } from "@supabase/supabase-js";

import { getActivityBookingById } from "@/lib/activity-bookings/service";
import { getOrderById } from "@/lib/orders/service";
import type { Database } from "@/supabase/types/database";
import { createNotificationEvent } from "./events";
import { processNotificationMessage } from "./email-worker";
import type { NotificationPayload } from "./types";

type VendorNoticeResult =
  | { queued: true; notificationId: string }
  | { queued: false; reason: "missing_context" | "missing_recipient" };

async function loadVendor(
  supabase: SupabaseClient<Database>,
  vendorId: string,
) {
  const { data, error } = await supabase
    .from("vendors")
    .select("id,name,owner_user_id,contact_email")
    .eq("id", vendorId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load vendor for notification: ${error.message}`);
  }
  return data;
}

export async function sendProviderBookingPendingNotice(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<VendorNoticeResult> {
  const booking = await getActivityBookingById(supabase, bookingId);
  if (!booking || !booking.order_id) {
    return { queued: false, reason: "missing_context" };
  }

  const [order, vendor, slotResult, activityResult, profileResult] =
    await Promise.all([
      getOrderById(supabase, booking.order_id),
      loadVendor(supabase, booking.vendor_id),
      supabase
        .from("availability_slots")
        .select("starts_at, ends_at")
        .eq("id", booking.slot_id)
        .maybeSingle(),
      supabase
        .from("activities")
        .select("title")
        .eq("id", booking.activity_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", booking.user_id)
        .maybeSingle(),
    ]);

  if (!order || !vendor) {
    return { queued: false, reason: "missing_context" };
  }

  const ownerResult = await supabase.auth.admin.getUserById(vendor.owner_user_id);
  const providerEmail =
    vendor.contact_email?.trim() || ownerResult.data.user?.email || null;

  if (!providerEmail) {
    return { queued: false, reason: "missing_recipient" };
  }

  const payload = {
    source: "uiv-travel-website",
    category: "provider",
    event: "provider_booking_pending",
    occurredAt: new Date().toISOString(),
    recipient: {
      email: providerEmail,
      displayName: vendor.name,
    },
    provider: {
      id: vendor.id,
      name: vendor.name,
      email: providerEmail,
    },
    customer: {
      id: booking.user_id,
      displayName: profileResult.data?.display_name ?? null,
    },
    order: {
      id: order.id,
      status: order.status,
      currency: order.currency,
      totalCents: order.total_cents,
    },
    booking: {
      id: booking.id,
      status: booking.status,
      participants: booking.participants,
      activityId: booking.activity_id,
      activityTitle: activityResult.data?.title ?? null,
      slotStartsAt: slotResult.data?.starts_at ?? null,
      slotEndsAt: slotResult.data?.ends_at ?? null,
      approvalDeadlineAt: booking.expires_at,
    },
  } satisfies NotificationPayload;

  const notification = await createNotificationEvent(supabase, {
    userId: vendor.owner_user_id,
    eventType: "provider_booking_pending",
    payload,
    dedupeKey: `provider-booking-pending:${booking.id}`,
  });

  if (notification.status !== "sent" && notification.status !== "skipped") {
    await processNotificationMessage(supabase, {
      notificationId: notification.id,
    });
  }

  return { queued: true, notificationId: notification.id };
}

export async function safeSendProviderBookingPendingNotice(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<void> {
  try {
    await sendProviderBookingPendingNotice(supabase, bookingId);
  } catch (error) {
    console.error("Provider booking pending notification failed", error);
  }
}
