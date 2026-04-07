import { NextResponse } from "next/server";
import {
  badRequest,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from "@/api-shared/route-helpers";
import type { CreateSlotInput, UpdateSlotInput } from "./types";

export function mapSlotRouteError(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : "Something went wrong";

  if (message === "Unauthorized") {
    return unauthorized();
  }
  if (message === "User is not associated with a vendor") {
    return forbidden(message);
  }
  if (message.startsWith("Forbidden:")) {
    return forbidden(message);
  }
  if (message === "Activity not found" || message === "Slot not found") {
    return notFound(message);
  }
  if (
    message ===
    "Cannot modify or cancel this slot because it has confirmed bookings."
  ) {
    return badRequest(message);
  }
  if (message === "No updates provided") {
    return badRequest(message);
  }
  if (message.startsWith("Could not ")) {
    return serverError(message);
  }
  if (
    message.includes("max_capacity") ||
    message.includes("starts_at") ||
    message.includes("duration_hours")
  ) {
    return badRequest(message);
  }

  return serverError(message);
}

type ParseCreateResult =
  | { ok: true; input: CreateSlotInput }
  | { ok: false; response: NextResponse };

export function parseCreateSlotBody(
  body: Record<string, unknown>,
): ParseCreateResult {
  const startsRaw = body.starts_at;
  if (typeof startsRaw !== "string" || startsRaw.trim() === "") {
    return { ok: false, response: badRequest("starts_at is required") };
  }
  const starts_at = startsRaw.trim();

  const cap = body.max_capacity;
  if (
    typeof cap !== "number" ||
    !Number.isInteger(cap) ||
    cap < 1
  ) {
    return {
      ok: false,
      response: badRequest("max_capacity must be an integer of at least 1"),
    };
  }

  return { ok: true, input: { starts_at, max_capacity: cap } };
}

type ParseUpdateResult =
  | { ok: true; input: UpdateSlotInput }
  | { ok: false; response: NextResponse };

export function parseUpdateSlotBody(
  body: Record<string, unknown>,
): ParseUpdateResult {
  const input: UpdateSlotInput = {};

  if (Object.prototype.hasOwnProperty.call(body, "starts_at")) {
    const v = body.starts_at;
    if (typeof v !== "string" || v.trim() === "") {
      return {
        ok: false,
        response: badRequest("starts_at must be a non-empty string"),
      };
    }
    input.starts_at = v.trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, "max_capacity")) {
    const cap = body.max_capacity;
    if (
      typeof cap !== "number" ||
      !Number.isInteger(cap) ||
      cap < 1
    ) {
      return {
        ok: false,
        response: badRequest("max_capacity must be an integer of at least 1"),
      };
    }
    input.max_capacity = cap;
  }

  if (input.starts_at === undefined && input.max_capacity === undefined) {
    return { ok: false, response: badRequest("No updates provided") };
  }

  return { ok: true, input };
}
