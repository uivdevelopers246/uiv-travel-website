import { NextResponse } from "next/server";

import { serverError } from "@/api-shared/route-helpers";
import { createProviderDailyDigestNotifications } from "@/lib/notifications/digest";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret?.trim() && req.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "Cron is not configured (CRON_SECRET)" },
      { status: 503 },
    );
  }
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const digest = await createProviderDailyDigestNotifications(supabase);
    return NextResponse.json({ digest }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
    return serverError(message);
  }
}
