import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserIdOrThrow } from "@/lib/vendors/ownership";
import { MAX_ACTIVITY_IMAGES, type ActivityImage } from "@/lib/activities/types";
import {
  badRequest,
  forbidden,
  notFound,
  parseJsonBody,
  parseUuidParam,
  requireRole,
  serverError,
} from "@/api-shared/route-helpers";
import {
  getSupabaseStorageObjectPath,
  isSupabaseStoragePublicUrl,
  normalizeOptionalImageUrl,
} from "@/lib/utils/image";

type RouteContext = {
  params: Promise<{ id: string }>;
};
type OwnedActivity = {
  vendor_id: string;
  vendors: { owner_user_id: string } | { owner_user_id: string }[] | null;
};

const STORAGE_BUCKET = "activity-images";

function getOwnerUserId(vendors: OwnedActivity["vendors"]): string | null {
  if (Array.isArray(vendors)) {
    return vendors[0]?.owner_user_id ?? null;
  }
  return vendors?.owner_user_id ?? null;
}

/**
 * GET /api/activities/[id]/images
 * Fetch all images for an activity
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const parsedParam = parseUuidParam(params.id, "activity");
  if ("response" in parsedParam) {
    return parsedParam.response;
  }
  const { id: activityId } = parsedParam;

  const supabase = await createClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: images, error } = await (supabase as any)
      .from("activity_images")
      .select("id, image_url, alt_text, display_order")
      .eq("activity_id", activityId)
      .order("display_order", { ascending: true });

    if (error) {
      return serverError("Failed to fetch images");
    }

    return NextResponse.json({ images: (images as unknown as ActivityImage[]) ?? [] });
  } catch (error) {
    console.error("Unexpected error fetching activity images:", error);
    return serverError("Internal server error");
  }
}

/**
 * POST /api/activities/[id]/images
 * Add a new image to an activity
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const parsedParam = parseUuidParam(params.id, "activity");
  if ("response" in parsedParam) {
    return parsedParam.response;
  }
  const { id: activityId } = parsedParam;

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["admin", "vendor"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }
  const { role } = roleResult;

  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .select("vendor_id, vendors!inner(owner_user_id)")
    .eq("id", activityId)
    .maybeSingle();

  if (activityError) {
    return serverError("Failed to verify activity access");
  }
  if (!activity) {
    return notFound("Activity not found");
  }

  const ownedActivity = activity as OwnedActivity;
  if (role === "vendor") {
    const userId = await getCurrentUserIdOrThrow(supabase);
    if (getOwnerUserId(ownedActivity.vendors) !== userId) {
      return forbidden("You do not own this activity");
    }
  }

  try {
    const parsedBody = await parseJsonBody(request);
    if ("response" in parsedBody) {
      return parsedBody.response;
    }
    const { body } = parsedBody;

    const imageUrl = normalizeOptionalImageUrl(body.image_url);
    if (!imageUrl) {
      return badRequest("image_url is required");
    }
    if (
      !isSupabaseStoragePublicUrl(imageUrl, STORAGE_BUCKET, ownedActivity.vendor_id)
    ) {
      return badRequest("image_url must reference an uploaded activity image");
    }

    let altText: string | null = null;
    if (body.alt_text !== undefined && body.alt_text !== null) {
      if (typeof body.alt_text !== "string") {
        return badRequest("alt_text must be a string or null");
      }
      altText = body.alt_text.trim() || null;
      if (altText && altText.length > 255) {
        return badRequest("alt_text is too long (max 255 characters)");
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imagesQuery = (supabase as any).from("activity_images");
    const { count, error: countError } = await imagesQuery
      .select("*", { count: "exact", head: true })
      .eq("activity_id", activityId);

    if (countError) {
      return serverError("Failed to add image");
    }

    if ((count ?? 0) >= MAX_ACTIVITY_IMAGES) {
      return badRequest(
        `Maximum of ${MAX_ACTIVITY_IMAGES} images allowed per activity`,
      );
    }

    const { data: maxOrderResult, error: maxOrderError } = await imagesQuery
      .select("display_order")
      .eq("activity_id", activityId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxOrderError) {
      return serverError("Failed to add image");
    }

    const nextOrder = ((maxOrderResult as unknown as { display_order: number } | null)?.display_order ?? -1) + 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newImage, error: insertError } = await (supabase as any)
      .from("activity_images")
      .insert({
        activity_id: activityId,
        image_url: imageUrl,
        alt_text: altText,
        display_order: nextOrder,
      })
      .select("id, image_url, alt_text, display_order")
      .single();

    if (insertError) {
      return serverError("Failed to add image");
    }

    return NextResponse.json({ image: newImage as unknown as ActivityImage }, { status: 201 });
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "Failed to add image",
    );
  }
}

/**
 * DELETE /api/activities/[id]/images
 * Delete an image from an activity (image_id passed in body)
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const parsedParam = parseUuidParam(params.id, "activity");
  if ("response" in parsedParam) {
    return parsedParam.response;
  }
  const { id: activityId } = parsedParam;

  const supabase = await createClient();
  const roleResult = await requireRole(supabase, ["admin", "vendor"]);
  if ("response" in roleResult) {
    return roleResult.response;
  }
  const { role } = roleResult;

  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .select("vendor_id, vendors!inner(owner_user_id)")
    .eq("id", activityId)
    .maybeSingle();

  if (activityError) {
    return serverError("Failed to verify activity access");
  }
  if (!activity) {
    return notFound("Activity not found");
  }

  const ownedActivity = activity as OwnedActivity;
  if (role === "vendor") {
    const userId = await getCurrentUserIdOrThrow(supabase);
    if (getOwnerUserId(ownedActivity.vendors) !== userId) {
      return forbidden("You do not own this activity");
    }
  }

  try {
    const parsedBody = await parseJsonBody(request);
    if ("response" in parsedBody) {
      return parsedBody.response;
    }
    const { body } = parsedBody;

    if (typeof body.image_id !== "string") {
      return badRequest("image_id is required");
    }
    const parsedImageParam = parseUuidParam(body.image_id, "image");
    if ("response" in parsedImageParam) {
      return parsedImageParam.response;
    }
    const { id: imageId } = parsedImageParam;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageQuery = (supabase as any).from("activity_images");
    const { data: imageRow, error: fetchError } = await imageQuery
      .select("id, image_url")
      .eq("id", imageId)
      .eq("activity_id", activityId)
      .maybeSingle();

    if (fetchError) {
      return serverError("Failed to delete image");
    }
    if (!imageRow) {
      return notFound("Image not found");
    }

    const { error: deleteError } = await imageQuery
      .delete()
      .eq("id", imageId)
      .eq("activity_id", activityId);

    if (deleteError) {
      return serverError("Failed to delete image");
    }

    const objectPath = getSupabaseStorageObjectPath(
      (imageRow as { image_url: string }).image_url,
      STORAGE_BUCKET,
    );
    if (objectPath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "Failed to delete image",
    );
  }
}
