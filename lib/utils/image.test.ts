import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSafeImageUrl,
  isSupabaseStoragePublicUrl,
  normalizeOptionalImageUrl,
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
