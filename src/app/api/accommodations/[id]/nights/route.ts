import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCalendarRange } from "@/lib/accommodation-calendar/service";
import { badRequest, notFound, parseUuidParam, serverError } from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

/** Public prices only; the separate host calendar remains owner-restricted. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = parseUuidParam((await params).id, "accommodation");
  if ("response" in parsed) return parsed.response;

  let range;
  try {
    const search = new URL(req.url).searchParams;
    range = validateCalendarRange(search.get("from"), search.get("to"));
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid calendar dates.");
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accommodation_booking_calendar", {
      p_accommodation_id: parsed.id,
      p_first_night: range.first_night,
      p_last_night: range.last_night,
    });
    if (error || !data) throw new Error("Calendar read failed");
    if (data.length === 0) return notFound("Accommodation not found.");
    return NextResponse.json({ nights: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return serverError("Could not load nightly prices. Please try again.");
  }
}
