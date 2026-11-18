/** Local-only integration checks. Requires the migrated Supabase Docker database. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);
const container = "supabase_db_uiv-travel-website";
async function sql(statement: string) {
  const { stdout } = await exec("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtc", statement]);
  return stdout.trim();
}
function asUser(id: string, statement: string) {
  return `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${id}'; ${statement}; commit;`;
}
async function main() {
  const users = Array.from({ length: 4 }, () => randomUUID());
  const [boundary, concurrent, rolling, other] = users;
  try {
    await sql(`insert into auth.users (id, email) values ${users.map(id => `('${id}', 'itinerary-test-${id}@example.invalid')`).join(",")}`);
    for (let i = 0; i < 10; i++) {
      assert.equal(await sql(asUser(boundary, "select public.record_itinerary_generation()")), "t");
    }
    assert.equal(await sql(asUser(boundary, "select public.record_itinerary_generation()")), "f");
    assert.equal(await sql(`select count(*) from public.itinerary_generations where user_id = '${boundary}'`), "10");
    console.log("PASS: requests 1–10 succeed; request 11 is rejected without inserting");

    // Independent database connections contend on the same user's advisory lock.
    // allSettled ensures no connection is still writing when fixtures are cleaned up.
    const attempts = await Promise.allSettled(Array.from({ length: 16 }, () => sql(asUser(concurrent, "select public.record_itinerary_generation()"))));
    assert(attempts.every(result => result.status === "fulfilled"), "All concurrent RPC calls must complete");
    const values = attempts.map(result => result.status === "fulfilled" ? result.value : "error");
    assert.equal(values.filter(value => value === "t").length, 10);
    assert.equal(values.filter(value => value === "f").length, 6);
    assert.equal(await sql(`select count(*) from public.itinerary_generations where user_id = '${concurrent}'`), "10");
    console.log("PASS: 16 concurrent calls grant exactly 10 slots");

    await sql(`insert into public.itinerary_generations (user_id, created_at) select '${rolling}', clock_timestamp() - interval '61 minutes' from generate_series(1, 10)`);
    assert.equal(await sql(asUser(rolling, "select public.record_itinerary_generation()")), "t");
    assert.equal(await sql(asUser(other, "select public.record_itinerary_generation()")), "t");
    assert.equal(await sql(asUser(other, "select count(*) from public.itinerary_generations")), "1");
    await assert.rejects(sql(asUser(other, `insert into public.itinerary_generations(user_id) values ('${other}')`)), /permission denied/);
    await assert.rejects(sql("set role anon; select public.record_itinerary_generation()"), /permission denied/);
    await assert.rejects(sql("set role authenticated; select public.record_itinerary_generation()"), /Authentication required/);
    console.log("PASS: rolling expiration, user isolation, own-row RLS, direct-write and anonymous denial");
  } finally {
    await sql(`delete from auth.users where id in (${users.map(id => `'${id}'`).join(",")})`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
