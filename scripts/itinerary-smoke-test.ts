/** Sends one real, authenticated request to a running local app (uses OpenAI credits). */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

loadEnvConfig(process.cwd());

async function main() {
  const appUrl = new URL(process.argv[2] ?? "http://localhost:3000");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(supabaseUrl && publishableKey && serviceKey && process.env.OPENAI_API_KEY, "Supabase and OpenAI keys must be configured");
  for (const url of [appUrl, new URL(supabaseUrl)]) {
    assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Smoke test only supports local app and Supabase URLs");
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `itinerary-smoke-${randomUUID()}@example.invalid`;
  const password = `Aa1!${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!error, `Could not create temporary local test user: ${error?.message}`);
  const user = data.user;
  assert(user);
  try {
    const cookies = new Map<string, string>();
    const client = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
        setAll: values => { for (const { name, value } of values) cookies.set(name, value); },
      },
    });
    const login = await client.auth.signInWithPassword({ email, password });
    assert(!login.error, "Could not authenticate temporary local test user");
    const response = await fetch(new URL("/api/itinerary", appUrl), {
      method: "POST",
      headers: { "content-type": "application/json", origin: appUrl.origin, cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ") },
      body: JSON.stringify({ tripStartDate: "2026-11-01", tripEndDate: "2026-11-03", budgetUsd: 1000, groupSize: 2, categories: ["culture", "nature", "water-sports", "adventure", "wildlife"] }),
      signal: AbortSignal.timeout(90_000),
    });
    const result = await response.json();
    assert.equal(response.status, 200, `Itinerary returned ${response.status}: ${JSON.stringify(result)}`);
    assert(result.days.some((day: { activities: unknown[] }) => day.activities.length > 0));
    assert(result.estimatedTotalUsd <= 1000);
    assert(result.warnings.some((warning: string) => warning.includes("availability has not been checked")));
    const log = await admin.from("itinerary_generations").select("id", { count: "exact" }).eq("user_id", user.id);
    assert(!log.error);
    assert.equal(log.count, 1, "One provider request must consume exactly one generation slot");
    console.log(`PASS: authenticated POST returned 200, ${result.days.length} itinerary days, estimated group total $${result.estimatedTotalUsd}, availability warning, and exactly one generation log row`);
  } finally {
    const cleanup = await admin.auth.admin.deleteUser(user.id);
    assert(!cleanup.error, "Could not remove temporary local test user");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
