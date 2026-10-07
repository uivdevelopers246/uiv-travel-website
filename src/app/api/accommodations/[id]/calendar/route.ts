import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCalendarUpdate, validateCalendarRange } from "@/lib/accommodation-calendar/service";
import {
  badRequest, forbidden, jsonError, notFound, parseJsonBody, parseUuidParam,
  requireRole, requireSameOriginPost, serverError,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

function calendarError(error: { code?: string }) {
  if (error.code === "42501") return forbidden("You cannot manage this accommodation.");
  if (error.code === "P0002") return notFound("Accommodation not found.");
  if (error.code === "23P01") return jsonError("Some selected nights have a booking or pending request. Choose other nights.", 409);
  if (error.code === "22023") return badRequest("Invalid dates or nightly price.");
  return serverError("Could not update or load the accommodation calendar. Please try again.");
}

export async function GET(req: Request, context: Context) {
  const parsed = parseUuidParam((await context.params).id, "accommodation");
  if ("response" in parsed) return parsed.response;
  const supabase = await createClient();
  const role = await requireRole(supabase, ["vendor", "admin"]);
  if ("response" in role) return role.response;
  let range;
  try {
    const search = new URL(req.url).searchParams;
    range = validateCalendarRange(search.get("from"), search.get("to"));
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid calendar dates.");
  }
  const { data, error } = await supabase.rpc("get_accommodation_calendar", {
    p_accommodation_id: parsed.id, p_first_night: range.first_night, p_last_night: range.last_night,
  });
  if (error) return calendarError(error);
  return NextResponse.json({ nights: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, context: Context) {
  const originError = requireSameOriginPost(req);
  if (originError) return originError;
  const parsed = parseUuidParam((await context.params).id, "accommodation");
  if ("response" in parsed) return parsed.response;
  const supabase = await createClient();
  const role = await requireRole(supabase, ["vendor", "admin"]);
  if ("response" in role) return role.response;
  const json = await parseJsonBody(req);
  if ("response" in json) return json.response;
  let update;
  try { update = parseCalendarUpdate(json.body); }
  catch (error) { return badRequest(error instanceof Error ? error.message : "Invalid calendar update."); }
  const { data, error } = await supabase.rpc("set_accommodation_nights", {
    p_accommodation_id: parsed.id,
    p_first_night: update.first_night, p_last_night: update.last_night,
    p_is_available: update.is_available, p_price_cents: update.price_cents,
  });
  if (error) return calendarError(error);
  return NextResponse.json({ updated: data }, { headers: { "Cache-Control": "no-store" } });
}
