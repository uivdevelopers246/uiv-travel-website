import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

const auth = vi.hoisted(() => ({ verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("authentication confirmation", () => {
  it("exchanges PKCE recovery codes before opening the password form", async () => {
    await expect(GET(new NextRequest("http://localhost:3000/auth/confirm?code=code&next=/auth/reset-password"))).rejects.toThrow("REDIRECT:/auth/reset-password");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("code");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("supports recovery token hashes and existing email confirmation", async () => {
    await expect(GET(new NextRequest("http://localhost:3000/auth/confirm?token_hash=token&type=recovery"))).rejects.toThrow("REDIRECT:/auth/reset-password");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "token", type: "recovery" });
    await expect(GET(new NextRequest("http://localhost:3000/auth/confirm?token_hash=token&type=signup&next=/account"))).rejects.toThrow("REDIRECT:/account");
  });

  it("returns expired recovery links to a retryable reset request", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    await expect(GET(new NextRequest("http://localhost:3000/auth/confirm?code=expired&next=/auth/reset-password"))).rejects.toThrow("REDIRECT:http://localhost:3000/auth/forgot-password?error=invalid_recovery_link");
  });

  it("rejects external and malformed return destinations", async () => {
    for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test"]) {
      expect(getSafeRedirectPath(value)).toBe("/");
    }
    expect(getSafeRedirectPath("/account?tab=profile")).toBe("/account?tab=profile");
    await expect(GET(new NextRequest("http://localhost:3000/auth/confirm?code=code&next=//evil.test"))).rejects.toThrow("REDIRECT:/");
  });
});
