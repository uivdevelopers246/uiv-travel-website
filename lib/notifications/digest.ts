import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";
import { createNotificationEvent } from "./events";
import type { NotificationPayload } from "./types";

type DigestResult = {
  created: number;
  skipped: number;
};

type VendorDigestRow = Pick<
  Database["public"]["Tables"]["vendors"]["Row"],
  "id" | "name" | "owner_user_id" | "contact_email"
>;

function barbadosDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Barbados",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function countBookings(
  supabase: SupabaseClient<Database>,
  vendorId: string,
  filters: {
    status?: string;
    updatedSince?: string;
    expiresBefore?: string;
  },
): Promise<number> {
  let query = supabase
    .from("activity_bookings")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.updatedSince) {
    query = query.gte("updated_at", filters.updatedSince);
  }
  if (filters.expiresBefore) {
    query = query.lte("expires_at", filters.expiresBefore);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Could not count digest bookings: ${error.message}`);
  }
  return count ?? 0;
}

async function countFailedPaymentOrders(
  supabase: SupabaseClient<Database>,
  vendorId: string,
  updatedSince: string,
): Promise<number> {
  const { data: bookingRows, error: bookingError } = await supabase
    .from("activity_bookings")
    .select("order_id")
    .eq("vendor_id", vendorId)
    .not("order_id", "is", null);

  if (bookingError) {
    throw new Error(`Could not load digest order ids: ${bookingError.message}`);
  }

  const orderIds = [
    ...new Set(
      (bookingRows ?? [])
        .map((row) => row.order_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (orderIds.length === 0) {
    return 0;
  }

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("id", orderIds)
    .eq("status", "failed")
    .gte("updated_at", updatedSince);

  if (error) {
    throw new Error(`Could not count digest failed payments: ${error.message}`);
  }
  return count ?? 0;
}

async function loadDigestPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{
  emailEnabled: boolean;
  dailyDigestEnabled: boolean;
  suppressed: boolean;
}> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("email_enabled,daily_digest_enabled,email_suppressed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load digest preferences: ${error.message}`);
  }

  return {
    emailEnabled: data?.email_enabled ?? true,
    dailyDigestEnabled: data?.daily_digest_enabled ?? false,
    suppressed: Boolean(data?.email_suppressed_at),
  };
}

async function loadVendors(
  supabase: SupabaseClient<Database>,
): Promise<VendorDigestRow[]> {
  const { data, error } = await supabase
    .from("vendors")
    .select("id,name,owner_user_id,contact_email")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load vendors for digest: ${error.message}`);
  }
  return (data ?? []) as VendorDigestRow[];
}

export async function createProviderDailyDigestNotifications(
  supabase: SupabaseClient<Database>,
  now = new Date(),
): Promise<DigestResult> {
  const vendors = await loadVendors(supabase);
  const dateKey = barbadosDateKey(now);
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const expiringBefore = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const result: DigestResult = { created: 0, skipped: 0 };

  for (const vendor of vendors) {
    const preferences = await loadDigestPreferences(supabase, vendor.owner_user_id);
    if (
      !preferences.emailEnabled ||
      !preferences.dailyDigestEnabled ||
      preferences.suppressed
    ) {
      result.skipped += 1;
      continue;
    }

    const ownerResult = await supabase.auth.admin.getUserById(vendor.owner_user_id);
    const email = vendor.contact_email?.trim() || ownerResult.data.user?.email || null;
    if (!email) {
      result.skipped += 1;
      continue;
    }

    const [
      pendingApprovals,
      expiringApprovals,
      confirmedBookings,
      declinedBookings,
      failedPayments,
    ] = await Promise.all([
      countBookings(supabase, vendor.id, { status: "pending_approval" }),
      countBookings(supabase, vendor.id, {
        status: "pending_approval",
        expiresBefore: expiringBefore,
      }),
      countBookings(supabase, vendor.id, {
        status: "confirmed",
        updatedSince: since,
      }),
      countBookings(supabase, vendor.id, {
        status: "declined",
        updatedSince: since,
      }),
      countFailedPaymentOrders(supabase, vendor.id, since),
    ]);

    const payload = {
      source: "uiv-travel-website",
      category: "provider_digest",
      event: "daily_digest",
      occurredAt: now.toISOString(),
      recipient: {
        email,
        displayName: vendor.name,
      },
      provider: {
        id: vendor.id,
        name: vendor.name,
        email,
      },
      summary: {
        newBookings: pendingApprovals,
        pendingApprovals,
        expiringApprovals,
        confirmedBookings,
        declinedBookings,
        failedPayments,
      },
    } satisfies NotificationPayload;

    await createNotificationEvent(supabase, {
      userId: vendor.owner_user_id,
      eventType: "daily_digest",
      payload,
      dedupeKey: `daily-digest:provider:${vendor.id}:${dateKey}`,
    });
    result.created += 1;
  }

  return result;
}
