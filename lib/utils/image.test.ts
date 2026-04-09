import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatFileSize,
  getSafeImageUrl,
  isSupabaseStoragePublicUrl,
  normalizeOptionalImageUrl,
  validateImageFile,
} from "./image";

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  vi.unstubAllGlobals();
});

describe("getSafeImageUrl", () => {
  it("allows http(s) and relative URLs", () => {
    expect(
      getSafeImageUrl("https://cdn.example.com/image.jpg", "/fallback.jpg"),
    ).toBe("https://cdn.example.com/image.jpg");
    expect(getSafeImageUrl("/images/example.jpg", "/fallback.jpg")).toBe(
      "/images/example.jpg",
    );
  });

  it("rejects unsafe protocols", () => {
    expect(getSafeImageUrl("javascript:alert(1)", "/fallback.jpg")).toBe(
      "/fallback.jpg",
    );
    expect(
      getSafeImageUrl("data:image/svg+xml,<svg></svg>", "/fallback.jpg"),
    ).toBe("/fallback.jpg");
  });
});

describe("normalizeOptionalImageUrl", () => {
  it("normalizes empty values", () => {
    expect(normalizeOptionalImageUrl(undefined)).toBeUndefined();
    expect(normalizeOptionalImageUrl(null)).toBeNull();
    expect(normalizeOptionalImageUrl("   ")).toBeNull();
  });

  it("throws on invalid inputs", () => {
    expect(() => normalizeOptionalImageUrl(42)).toThrow(
      "image_url must be a string or null",
    );
    expect(() => normalizeOptionalImageUrl("javascript:alert(1)")).toThrow(
      "image_url must use http or https",
    );
  });
});

describe("validateImageFile", () => {
  it("rejects files larger than the configured maximum with the selected size", () => {
    const file = new File(["x".repeat(6 * 1024 * 1024)], "large.jpg", {
      type: "image/jpeg",
    });

    expect(validateImageFile(file)).toBe(
      "Image file is too large (6.0 MB). Maximum size is 5 MB.",
    );
  });

  it("rejects unsupported file extensions", () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    expect(validateImageFile(file)).toBe(
      "Only image files are allowed (JPG, JPEG, PNG, GIF, WEBP).",
    );
  });
});

describe("formatFileSize", () => {
  it("formats bytes into a readable label", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("isSupabaseStoragePublicUrl", () => {
  it("requires the configured bucket and vendor prefix", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";

    expect(
      isSupabaseStoragePublicUrl(
        "https://project.supabase.co/storage/v1/object/public/activity-images/vendor-1/photo.jpg",
        "activity-images",
        "vendor-1",
      ),
    ).toBe(true);

    expect(
      isSupabaseStoragePublicUrl(
        "https://project.supabase.co/storage/v1/object/public/activity-images/vendor-2/photo.jpg",
        "activity-images",
        "vendor-1",
      ),
    ).toBe(false);

    expect(
      isSupabaseStoragePublicUrl(
        "https://other.supabase.co/storage/v1/object/public/activity-images/vendor-1/photo.jpg",
        "activity-images",
        "vendor-1",
      ),
    ).toBe(false);
  });
});
