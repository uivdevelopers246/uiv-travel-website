import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/roles";
import {
  updateVendorProfile,
  type UpdateVendorProfileInput,
} from "@/lib/vendors/service";

const MAX_SHORT = 255;
const MAX_MEDIUM = 500;

function isReasonableEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > MAX_SHORT) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const role = await getUserRole(supabase);

  if (role === "guest") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (role !== "admin" && role !== "vendor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload: UpdateVendorProfileInput = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    if (name.length > MAX_SHORT) {
      return NextResponse.json(
        { error: "Name is too long (max 255 characters)" },
        { status: 400 },
      );
    }
    payload.name = name;
  }

  if (typeof body.owner_full_name !== "undefined") {
    if (body.owner_full_name === null) {
      payload.owner_full_name = null;
    } else if (typeof body.owner_full_name === "string") {
      const trimmed = body.owner_full_name.trim();
      if (trimmed.length > MAX_MEDIUM) {
        return NextResponse.json(
          { error: "owner_full_name is too long" },
          { status: 400 },
        );
      }
      payload.owner_full_name = trimmed || null;
    } else {
      return NextResponse.json(
        { error: "owner_full_name must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (typeof body.business_phone !== "undefined") {
    if (body.business_phone === null) {
      payload.business_phone = null;
    } else if (typeof body.business_phone === "string") {
      const trimmed = body.business_phone.trim();
      if (trimmed.length > MAX_SHORT) {
        return NextResponse.json(
          { error: "business_phone is too long" },
          { status: 400 },
        );
      }
      payload.business_phone = trimmed || null;
    } else {
      return NextResponse.json(
        { error: "business_phone must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (typeof body.personal_phone !== "undefined") {
    if (body.personal_phone === null) {
      payload.personal_phone = null;
    } else if (typeof body.personal_phone === "string") {
      const trimmed = body.personal_phone.trim();
      if (trimmed.length > MAX_SHORT) {
        return NextResponse.json(
          { error: "personal_phone is too long" },
          { status: 400 },
        );
      }
      payload.personal_phone = trimmed || null;
    } else {
      return NextResponse.json(
        { error: "personal_phone must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (typeof body.contact_email !== "undefined") {
    if (body.contact_email === null) {
      payload.contact_email = null;
    } else if (typeof body.contact_email === "string") {
      const trimmed = body.contact_email.trim();
      if (!isReasonableEmail(trimmed)) {
        return NextResponse.json(
          { error: "contact_email must be a valid email address" },
          { status: 400 },
        );
      }
      payload.contact_email = trimmed || null;
    } else {
      return NextResponse.json(
        { error: "contact_email must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (typeof body.is_incorporated !== "undefined") {
    if (body.is_incorporated === null) {
      payload.is_incorporated = null;
    } else if (typeof body.is_incorporated === "boolean") {
      payload.is_incorporated = body.is_incorporated;
    } else {
      return NextResponse.json(
        { error: "is_incorporated must be a boolean or null" },
        { status: 400 },
      );
    }
  }

  if (typeof body.country_of_incorporation !== "undefined") {
    if (body.country_of_incorporation === null) {
      payload.country_of_incorporation = null;
    } else if (typeof body.country_of_incorporation === "string") {
      const trimmed = body.country_of_incorporation.trim();
      if (trimmed.length > MAX_MEDIUM) {
        return NextResponse.json(
          { error: "country_of_incorporation is too long" },
          { status: 400 },
        );
      }
      payload.country_of_incorporation = trimmed || null;
    } else {
      return NextResponse.json(
        { error: "country_of_incorporation must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (typeof body.business_registration_number !== "undefined") {
    if (body.business_registration_number === null) {
      payload.business_registration_number = null;
    } else if (typeof body.business_registration_number === "string") {
      const trimmed = body.business_registration_number.trim();
      if (trimmed.length > MAX_MEDIUM) {
        return NextResponse.json(
          { error: "business_registration_number is too long" },
          { status: 400 },
        );
      }
      payload.business_registration_number = trimmed || null;
    } else {
      return NextResponse.json(
        { error: "business_registration_number must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  try {
    const updated = await updateVendorProfile(supabase, payload);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update vendor profile";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === "User is not associated with a vendor") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "No fields to update") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
