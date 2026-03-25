/**
 * Validates and sanitizes image URLs to prevent XSS attacks.
 * Only allows http:, https:, and data: (for base64) protocols.
 * 
 * @param url - The URL to validate
 * @param fallback - The fallback URL to use if validation fails
 * @returns The sanitized URL or the fallback
 */
export function getSafeImageUrl(url: string | null, fallback: string): string {
  if (!url) return fallback;
  try {
    // For client-side, use window.location.origin; for server-side, use a dummy base
    const base = typeof window !== "undefined" ? window.location.origin : "https://example.com";
    const parsed = new URL(url, base);
    if (["http:", "https:", "data:"].includes(parsed.protocol)) {
      return url;
    }
  } catch {
    // Invalid URL, use fallback
  }
  return fallback;
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
