const RELATIVE_URL_BASE = "https://example.com";
const ALLOWED_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

function parseImageUrl(url: string) {
  const base =
    typeof window !== "undefined" ? window.location.origin : RELATIVE_URL_BASE;
  return new URL(url, base);
}

/**
 * Validates and sanitizes image URLs to prevent unsafe protocols from reaching
 * image tags. Only http(s) URLs are allowed.
 */
export function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = parseImageUrl(url);
    return ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Returns a validated image URL or the provided fallback.
 */
export function getSafeImageUrl(url: string | null, fallback: string): string {
  if (!url) return fallback;
  return isSafeImageUrl(url) ? url : fallback;
}

/**
 * Normalizes optional image URLs accepted by the API. Blank strings become null.
 */
export function normalizeOptionalImageUrl(
  value: unknown,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("image_url must be a string or null");
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isSafeImageUrl(trimmed)) {
    throw new Error("image_url must use http or https");
  }

  return trimmed;
}

export function getSupabaseStorageObjectPath(
  url: string,
  bucket: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!supabaseUrl) return null;

  try {
    const storageBaseUrl = new URL(
      `/storage/v1/object/public/${bucket}/`,
      supabaseUrl,
    );
    const parsed = new URL(url);

    if (parsed.origin !== storageBaseUrl.origin) {
      return null;
    }
    if (!parsed.pathname.startsWith(storageBaseUrl.pathname)) {
      return null;
    }

    const objectPath = decodeURIComponent(
      parsed.pathname.slice(storageBaseUrl.pathname.length),
    );
    return objectPath || null;
  } catch {
    return null;
  }
}

export function isSupabaseStoragePublicUrl(
  url: string,
  bucket: string,
  requiredPrefix?: string,
): boolean {
  const objectPath = getSupabaseStorageObjectPath(url, bucket);
  if (!objectPath) {
    return false;
  }

  if (!requiredPrefix) {
    return true;
  }

  return objectPath === requiredPrefix || objectPath.startsWith(`${requiredPrefix}/`);
}

/** Default fallback image for activities and accommodations */
export const DEFAULT_IMAGE_FALLBACK = "/images/hero/ScenicHill.JPG";

/** Maximum file size for image uploads (5MB) */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed image file extensions */
export const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"] as const;

/**
 * Validates an image file for upload.
 * @param file - The file to validate
 * @returns An error message if validation fails, or null if valid
 */
export function validateImageFile(file: File): string | null {
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "Image file is too large. Maximum size is 5MB.";
  }

  const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(fileExt as typeof ALLOWED_IMAGE_EXTENSIONS[number])) {
    return "Only image files are allowed (jpg, jpeg, png, gif, webp).";
  }

  return null;
}
