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
  "Cart is empty",
  "Unsupported cart line type",
  "Accommodation price is not set",
  "Accommodation is not available for booking",
  "These stay dates are not available",
  "Guest count exceeds accommodation capacity",
  "Invalid check_in date",
  "Invalid check_out date",
  "Invalid stay dates",
  "A stay cannot exceed 366 nights",
  "check_out must be after check_in",
  "check_in must not be in the past",
  "Only accommodation cart lines can update guests",
  "Cart line is missing stay details",
  "Your cart contains overlapping stays for the same accommodation. Remove one before checkout.",
  "Accommodation price has changed. Remove this stay and add it again to review the current price.",
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
