import { ACTIVITY_BOOKING_STATUSES, type ActivityBookingStatus } from "./constants";

/** Matches existing API routes (e.g. activities `[id]`). */
export function isUuid(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parseLimitOffset(searchParams: URLSearchParams): {
  limit: number;
  offset: number;
} {
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");
  let limit =
    limitRaw === null || limitRaw === ""
      ? DEFAULT_LIMIT
      : Number.parseInt(limitRaw, 10);
  let offset =
    offsetRaw === null || offsetRaw === ""
      ? 0
      : Number.parseInt(offsetRaw, 10);
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  }
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }
  if (!Number.isFinite(offset) || !Number.isInteger(offset) || offset < 0) {
    offset = 0;
  }
  return { limit, offset };
}

export function parseOptionalStatusParam(
  raw: string | null,
):
  | { ok: true; status: ActivityBookingStatus | undefined }
  | { ok: false } {
  if (raw === null || raw === "") {
    return { ok: true, status: undefined };
  }
  if ((ACTIVITY_BOOKING_STATUSES as readonly string[]).includes(raw)) {
    return { ok: true, status: raw as ActivityBookingStatus };
  }
  return { ok: false };
}

export function parseOptionalUuidParam(
  paramLabel: string,
  raw: string | null,
):
  | { ok: true; value: string | undefined }
  | { ok: false; error: string } {
  if (raw === null || raw === "") {
    return { ok: true, value: undefined };
  }
  if (!isUuid(raw)) {
    return { ok: false, error: `Invalid ${paramLabel}.` };
  }
  return { ok: true, value: raw };
}
