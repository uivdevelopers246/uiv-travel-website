import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AccommodationFormClient } from "./AccommodationFormClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/components/shared", () => ({ ImageManager: () => null, LocationPickerMap: () => null }));

describe("accommodation listing form", () => {
  it.each(["create", "edit"] as const)("manages %s pricing through the calendar", (mode) => {
    const html = renderToStaticMarkup(
      <AccommodationFormClient mode={mode} accommodationId={mode === "edit" ? "stay-1" : undefined} vendorId="vendor-1" />,
    );
    expect(html).not.toContain("Display pricing");
    expect(html).not.toContain("Min Price per Night");
    expect(html).not.toContain("Max Price per Night");
    expect(html).not.toContain('step="0.01"');
    expect(html).toContain("price range updates automatically from nights currently available to book");
    if (mode === "create") {
      expect(html).toContain("After saving your listing, set");
    } else {
      expect(html).toContain('href="/my-listings/manage/accommodations/stay-1/calendar"');
    }
  });
});
