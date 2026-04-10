import { NextResponse } from "next/server";
import {
  badRequest,
  notFound,
  serverError,
  unauthorized,
} from "@/api-shared/route-helpers";

const BAD_REQUEST_EXACT = new Set([
  "This slot is no longer available",
  "Activity is not available for booking",
  "Activity price is not set",
  "Not enough spots left for this time slot",
  "Only activity cart lines can be updated",
  "Cart line is missing a slot",
]);

/**
 * Maps errors from `lib/cart/service` to HTTP responses. Database-layer messages
 * from `cartServiceError` (`Could not …`) become a generic 500 body.
 */
export function handleCartRouteError(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : "Something went wrong. Please try again.";

  if (message === "Unauthorized") {
    return unauthorized();
  }
  if (message === "Cart line not found" || message === "Slot not found") {
    return notFound(message);
  }
  if (
    BAD_REQUEST_EXACT.has(message) ||
    message.endsWith(" must be a positive integer")
  ) {
    return badRequest(message);
  }
  if (message.startsWith("Could not ")) {
    return serverError("Something went wrong. Please try again.");
  }
  return serverError("Something went wrong. Please try again.");
}
