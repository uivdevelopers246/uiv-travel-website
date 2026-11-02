/** Sends one real, authenticated request to a running local app (uses OpenAI credits). */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

loadEnvConfig(process.cwd());

async function main() {
  const appUrl = new URL(process.argv[2] ?? "http://localhost:3000");
  const mode = process.argv[3] ?? "activities";
  assert(mode === "activities" || mode === "activities_and_accommodation", "Invalid smoke-test mode");
  const day = (offset: number) => new Date(Date.parse(new Date().toISOString().slice(0, 10)) + offset * 86_400_000).toISOString().slice(0, 10);
  const checkInDate = day(14);
  const checkOutDate = day(16);
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
      body: JSON.stringify({ tripStartDate: checkInDate, tripEndDate: checkOutDate, mode, groupSize: 2, activities: { budgetUsd: 1000, categories: ["culture", "nature", "water-sports", "adventure", "wildlife"] }, ...(mode === "activities_and_accommodation" ? { accommodation: { budgetUsd: 1000, checkInDate, checkOutDate } } : {}) }),
      signal: AbortSignal.timeout(90_000),
    });
    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
    assert.equal(response.status, 200, `Itinerary returned ${response.status}: ${JSON.stringify(result)}`);
    assert(result.days.some((day: { activities: unknown[] }) => day.activities.length > 0));
    assert.equal(result.mode, mode);
    assert(result.estimatedCosts.activitiesUsd <= 1000);
    if (mode === "activities_and_accommodation") {
      assert(result.accommodation?.property?.id);
      assert.equal(result.accommodation.checkInDate, checkInDate);
      assert.equal(result.accommodation.checkOutDate, checkOutDate);
      const quote = await client.rpc("accommodation_stay_quote", { p_accommodation_id: result.accommodation.property.id, p_check_in: checkInDate, p_check_out: checkOutDate });
      assert(!quote.error);
      const stay = quote.data as { available: boolean; total_cents: number };
      assert(stay.available);
      assert.equal(result.accommodation.property.totalCents, stay.total_cents);
      assert.equal(result.estimatedCosts.accommodationUsd, stay.total_cents / 100);
      assert(result.estimatedCosts.accommodationUsd <= 1000);
    } else {
      assert.equal(result.accommodation, null);
      assert.equal(result.estimatedCosts.accommodationUsd, 0);
    }
    assert.equal(Math.round(result.estimatedCosts.totalUsd * 100), Math.round(result.estimatedCosts.activitiesUsd * 100) + Math.round(result.estimatedCosts.accommodationUsd * 100));
    assert(result.warnings.some((warning: string) => warning.includes("availability has not been checked")));
    const log = await admin.from("itinerary_generations").select("id", { count: "exact" }).eq("user_id", user.id);
    assert(!log.error);
    assert.equal(log.count, 1, "One provider request must consume exactly one generation slot");
    console.log(`PASS: authenticated POST returned 200, ${result.days.length} itinerary days, estimated group total $${result.estimatedCosts.totalUsd}, availability warning, and exactly one generation log row`);
  } finally {
    const cleanup = await admin.auth.admin.deleteUser(user.id);
    assert(!cleanup.error, "Could not remove temporary local test user");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
