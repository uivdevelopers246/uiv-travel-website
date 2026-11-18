import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateRequest } from "@/lib/itinerary/validateRequest";
import {
  InvalidItineraryPlanError,
} from "@/lib/itinerary/validatePlan";
import {
  ItineraryModelError,
  OpenAIConfigurationError,
} from "@/lib/itinerary/plan";
import {
  createCompleteItinerary,
  NoItineraryCandidatesError,
  NoAccommodationCandidatesError,
} from "@/lib/itinerary/service";
import { ItineraryRateLimitError } from "@/lib/itinerary/rateLimit";
import {
  badRequest,
  jsonError,
  parseJsonBody,
  requireAuthenticatedUser,
  requireSameOriginPost,
  serverError,
  tooManyRequests,
} from "@/api-shared/route-helpers";

function handleItineraryError(error: unknown): NextResponse {
  if (error instanceof NoItineraryCandidatesError || error instanceof NoAccommodationCandidatesError) {
    return badRequest(error.message);
  }
  if (error instanceof ItineraryRateLimitError) {
    return tooManyRequests(error.message);
  }
  if (error instanceof OpenAIConfigurationError) {
    return jsonError("AI itinerary generation is not configured", 503);
  }
  if (
    error instanceof ItineraryModelError ||
    error instanceof InvalidItineraryPlanError
  ) {
    return jsonError("Could not generate a valid itinerary. Please try again.", 502);
  }

  return serverError("Could not create itinerary. Please try again.");
}

export async function POST(request: Request) {
  const originError = requireSameOriginPost(request);
  if (originError) return originError;

  try {
    const supabase = await createClient();
    const authResponse = await requireAuthenticatedUser(supabase);
    if (authResponse) return authResponse;

    const parsedBody = await parseJsonBody(request);
    if ("response" in parsedBody) return parsedBody.response;

    const validation = validateRequest(parsedBody.body);
    if (!validation.ok) return badRequest(validation.error);

    const itinerary = await createCompleteItinerary(supabase, validation.prefs);
    return NextResponse.json(itinerary);
  } catch (error: unknown) {
    return handleItineraryError(error);
  }
}
