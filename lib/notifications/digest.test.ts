import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";
import { createProviderDailyDigestNotifications } from "./digest";

function thenableQuery(result: Record<string, unknown>) {
  return {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (resolve: (value: Record<string, unknown>) => unknown) =>
      Promise.resolve(resolve(result)),
  };
}

describe("provider digest", () => {
  it("includes activity and accommodation bookings and failed-payment orders", async () => {
    const bookingTables: string[] = [];
    const insertedEvents: unknown[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "vendors") {
          return {
            select: vi.fn(() =>
              thenableQuery({
                data: [
                  {
                    id: "vendor-1",
                    name: "Island Stays",
                    owner_user_id: "user-1",
                    contact_email: "vendor@example.com",
                  },
                ],
                error: null,
              }),
            ),
          };
        }
        if (table === "notification_preferences") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                email_enabled: true,
                daily_digest_enabled: true,
                email_suppressed_at: null,
              },
              error: null,
            }),
          };
        }
        if (table === "activity_bookings" || table === "accommodation_bookings") {
          return {
            select: vi.fn((columns: string, options?: { head?: boolean }) => {
              bookingTables.push(table);
              if (columns === "order_id" && !options?.head) {
                return thenableQuery({
                  data: [{ order_id: `${table}-order` }],
                  error: null,
                });
              }
              return thenableQuery({
                count: table === "activity_bookings" ? 1 : 2,
                error: null,
              });
            }),
          };
        }
        if (table === "orders") {
          return {
            select: vi.fn(() => thenableQuery({ count: 2, error: null })),
          };
        }
        if (table === "notification_events") {
          const terminal = {
            single: vi.fn().mockResolvedValue({
              data: {
                id: "notification-1",
                status: "pending",
              },
              error: null,
            }),
          };
          return {
            insert: vi.fn((event) => {
              insertedEvents.push(event);
              return {
                select: vi.fn(() => terminal),
              };
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      },
    } as unknown as SupabaseClient<Database>;

    const result = await createProviderDailyDigestNotifications(
      supabase,
      new Date("2026-08-04T12:00:00.000Z"),
    );

    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(bookingTables).toContain("activity_bookings");
    expect(bookingTables).toContain("accommodation_bookings");
    expect(insertedEvents).toEqual([
      expect.objectContaining({
        event_type: "daily_digest",
        payload: expect.objectContaining({
          summary: {
            newBookings: 3,
            pendingApprovals: 3,
            expiringApprovals: 3,
            confirmedBookings: 3,
            declinedBookings: 3,
            failedPayments: 2,
          },
        }),
      }),
    ]);
  });
});
