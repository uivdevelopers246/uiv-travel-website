import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { formatAdminTimestamp } from "@/lib/utils/formatting";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ManageUsersClient } from "./ManageUsersClient";

describe("admin timestamps", () => {
  it("renders the same timestamp regardless of the server or browser locale", () => {
    const value = "2026-07-03T16:45:57+01:00";
    expect(formatAdminTimestamp(value)).toBe("2026-07-03 15:45 UTC");
    expect(formatAdminTimestamp(null)).toBe("—");
    expect(formatAdminTimestamp("invalid")).toBe("—");
    const html = renderToStaticMarkup(<ManageUsersClient users={[{ id: "user", display_name: "Test user", created_at: value }]} vendors={[]} adminIds={[]} />);
    expect(html).toContain("2026-07-03 15:45 UTC");
  });
});
