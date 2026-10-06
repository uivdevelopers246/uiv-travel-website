import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccommodationById } from "@/lib/accommodations/service";
import { parseAndValidateStayDates } from "@/lib/cart/service";
import { getAccommodationStayQuote } from "@/lib/accommodation-calendar/service";
import {
  badRequest,
  notFound,
  parseUuidParam,
  serverError,
} from "@/api-shared/route-helpers";

export const dynamic = "force-dynamic";

/** Public, date-specific inventory check; never exposes another guest's booking. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = parseUuidParam((await params).id, "accommodation");
  if ("response" in parsed) return parsed.response;

  const search = new URL(req.url).searchParams;
  const guestsText = search.get("guests") ?? "1";
  const guests = Number(guestsText);
  if (!/^\d+$/.test(guestsText) || !Number.isSafeInteger(guests) || guests < 1) {
    return badRequest("guests must be a positive integer");
  }

  let stay: ReturnType<typeof parseAndValidateStayDates>;
  try {
    stay = parseAndValidateStayDates(
      search.get("check_in") ?? "",
      search.get("check_out") ?? "",
    );
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid stay dates");
  }

  try {
    const supabase = await createClient();
    const listing = await getAccommodationById(supabase, parsed.id);
    if (!listing) {
      return notFound("Accommodation not found");
    }
    if (listing.max_guest_capacity != null && guests > listing.max_guest_capacity) {
      return badRequest("Guest count exceeds accommodation capacity");
    }

    const quote = await getAccommodationStayQuote(
      supabase,
      parsed.id,
      stay.check_in,
      stay.check_out,
    );
    return NextResponse.json(
      quote,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return serverError("Could not check accommodation availability. Please try again.");
  }
}
