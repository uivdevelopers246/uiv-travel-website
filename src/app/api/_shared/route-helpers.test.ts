import { describe, expect, it } from "vitest";

import { requireSameOriginPost } from "./route-helpers";

describe("requireSameOriginPost", () => {
  it("allows server-side posts without an Origin header", () => {
    const response = requireSameOriginPost(
      new Request("https://uiv.example/api/checkout", { method: "POST" }),
    );

    expect(response).toBeNull();
  });

  it("allows same-origin browser posts", () => {
    const response = requireSameOriginPost(
      new Request("https://uiv.example/api/checkout", {
        method: "POST",
        headers: { origin: "https://uiv.example" },
      }),
    );

    expect(response).toBeNull();
  });

  it("rejects cross-origin browser posts", async () => {
    const response = requireSameOriginPost(
      new Request("https://uiv.example/api/checkout", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Cross-origin request blocked",
    });
  });
});
