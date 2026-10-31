# Activity itinerary verification

Run focused unit, route, and activity-service regression tests:

```sh
npm run test:run -- lib/itinerary src/app/api/itinerary lib/activities
npx tsc --noEmit
npm run build
```

`npm run build -- --webpack` is an alternative when the environment prevents Turbopack from binding its worker port. The existing notification Handlebars dependency may emit Webpack warnings.

Run database checks against the migrated local Supabase Docker instance:

```sh
npm run itinerary:test:db
```

This command targets `supabase_db_uiv-travel-website`. It creates temporary users, exercises the real RPC across independent connections, and removes the users and cascading generation rows in a `finally` block. It verifies requests 1–10, rejection of request 11, exactly 10 successful slots across 16 concurrent requests, expiration of old history, user isolation, own-row RLS, denied direct writes, and denied anonymous/unauthenticated calls. It does not apply migrations or reset the database.

For a real authenticated HTTP request, start the local app and run:

```sh
npm run itinerary:test:smoke -- http://localhost:3000
```

Both the app and smoke-test process must use the same **local** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The test also needs the matching local `SUPABASE_SERVICE_ROLE_KEY` and a funded `OPENAI_API_KEY`. Environment variables override `.env.local`; obtain the local values from `supabase status`. The script refuses remote app/database URLs, creates and confirms a temporary local user without sending email, signs in, sends session cookies to `POST /api/itinerary`, and removes the user afterward. The local catalog must contain published activities matching the request. This command uses a real OpenAI request and checks for a 200 response, selected activities, a group total within budget, the availability warning, and exactly one generation log row.

## Step 7 verification result

- Unit/route/regression suite, TypeScript, and targeted ESLint checks passed.
- Real local database rate-limit concurrency and RLS checks passed.
- Webpack production build passed. Default Turbopack build hit an environment worker-port restriction.
- After switching generation to `gpt-6-luna`, the authenticated local HTTP request passed: OpenAI completed successfully, the endpoint returned 200 with 3 itinerary days, a $410 estimated group total, an availability warning, and exactly one generation log row. The temporary local test user was removed. The earlier `gpt-4.1-mini` attempt returned `credit_balance_exhausted` / `insufficient_quota`.
