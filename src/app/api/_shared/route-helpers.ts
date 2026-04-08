import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserRole, type UserRole } from "@/lib/auth/roles";
import type { Database } from "@/supabase/types/database";

type JsonBodyResult =
  | { body: Record<string, unknown>; response?: never }
  | { body?: never; response: NextResponse };

type UuidParamResult =
  | { id: string; response?: never }
  | { id?: never; response: NextResponse };

type RoleResult =
  | { role: UserRole; response?: never }
  | { role?: never; response: NextResponse };

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export function badRequest(message: string) {
  return jsonError(message, 400);
}

export function unauthorized(message = "Unauthorized") {
  return jsonError(message, 401);
}

export function forbidden(message = "Forbidden") {
  return jsonError(message, 403);
}

export function notFound(message: string) {
  return jsonError(message, 404);
}

export function serverError(message: string) {
  return jsonError(message, 500);
}

export async function parseJsonBody(req: Request): Promise<JsonBodyResult> {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { response: badRequest("Invalid JSON body") };
    }
    return { body: body as Record<string, unknown> };
  } catch {
    return { response: badRequest("Invalid JSON body") };
  }
}

export function parseUuidParam(
  id: string | undefined,
  label: string,
): UuidParamResult {
  const isUuid = typeof id === "string" && /^[0-9a-fA-F-]{36}$/.test(id);
  if (!isUuid) {
    return { response: badRequest(`Invalid ${label} id.`) };
  }
  return { id };
}

export async function requireAuthenticatedUser(
  supabase: SupabaseClient<Database>,
) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return unauthorized();
  }
  return null;
}

export async function requireRole(
  supabase: SupabaseClient<Database>,
  allowedRoles: readonly UserRole[],
): Promise<RoleResult> {
  const role = await getUserRole(supabase);

  if (role === "guest") {
    return { response: unauthorized() };
  }

  if (!allowedRoles.includes(role)) {
    return { response: forbidden() };
  }

  return { role };
}
