## System Overview

UIV Travel is a Barbados-focused travel site where **vendors** list **activities** (water sports, wildlife, adventure, culture, nature). **Public** users browse published activities; **admins** manage users and vendors. The app is a single Next.js application using the App Router, with Supabase for auth, Postgres (with PostGIS), and storage. Activity locations are set from user-provided coordinates (e.g. device geolocation or map pin) via a Postgres RPC; no map UI is present in the repo yet.

## Tech Stack

- **Runtime:** Node.js (Next.js 16)
- **Framework:** Next.js 16 (App Router only; no Pages Router)
- **Backend / BaaS:** Supabase
  - Auth (email OTP), Postgres, Row Level Security (RLS), Storage (`activity-images` bucket)
  - PostGIS extension enabled for `activities.location_point`
- **Styling:** Tailwind CSS v4, Google Fonts (Playfair Display, Source Sans 3)
- **Testing:** Vitest
- **Database tooling:** Supabase CLI (`supabase db push`, `supabase db reset`), seed script `scripts/seed.ts`

## Runtime Environments

- **Server:** Next.js server (API routes, Server Components, Server Actions). Uses `createClient()` from `@/lib/supabase/server` (cookie-based Supabase client via `@supabase/ssr`).
- **Client:** Browser. Uses `createClient()` from `@/lib/supabase/client` (browser client). Client components fetch from API routes or use Supabase client for auth state and storage uploads.
- **Deployment:** Assumed Vercel (signup uses `NEXT_PUBLIC_VERCEL_URL`). Supabase project is separate (hosted Supabase).

**Environment variables (used in code):**


| Variable                                          | Purpose                                                     |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                        | Supabase project URL (required at build/run)                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`            | Anon key for browser and server Supabase clients (required) |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_VERCEL_URL` | Signup redirect URL (production)                            |


Proxy module references `NEXT_PUBLIC_SUPABASE_ANON_KEY` in an error message; the code actually uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. TODO / Verify intended name.

## Request/Response Flows

- **Public user browsing activities**
  1. User requests `/activities`.
  2. Next.js runs the server component `ActivitiesPage`; it calls `createClient()` from `@/lib/supabase/server`.
  3. Server queries `activities` with `status = 'published'`, selects public columns and `vendors(name)`.
  4. RLS allows anonymous/authenticated read for rows where `status = 'published'` (or vendor/admin visibility).
  5. Server renders `ActivitiesClient` with the fetched list; client handles filters and role (for “Manage activities” link).
  6. Optional: client calls `GET /api/activities` (e.g. for limit/offset); same server `createClient()` and `listActivities()` from `@/lib/activities/service`; response JSON list of public activities.
- **Vendor creating/updating an activity**
  1. Vendor is authenticated; they open `/activities/manage` or `/activities/manage/[id]`.
  2. Server component uses `createClient()` and `getUserRole()`; redirects guest to login; allows only admin/vendor into manage pages.
  3. **Create:** Client submits to `POST /api/activities`. Route uses server `createClient()`, validates body (including optional `latitude`/`longitude`), then `createActivity(supabase, input)`. Service resolves vendor, inserts into `activities`, and if valid coordinates are provided calls `set_activity_location_point` RPC to set the map pin. Text `location` is stored for display only.
  4. **Update:** Client submits to `PATCH /api/activities/[id]`. Route uses `getUserRole()` and `updateActivity(supabase, id, updates)`. Service checks vendor ownership and updates allowed columns. If `latitude`/`longitude` are provided (or both null to clear), the service calls `set_activity_location_point` RPC. No geocoding is used.
  5. RLS on `activities` restricts INSERT/UPDATE to the owning vendor or site admin; column grants restrict writable columns (e.g. no direct write to `rating` or `location_point`).

## Auth & Authorization Model (High-level)

- **Auth:** Supabase Auth. Email OTP (magic link / OTP). Signup uses `signInWithOtp`; confirmation is handled by `GET /auth/confirm` (verifies `token_hash` and `type`, then redirects). No middleware file named `middleware.ts` exists; session-refresh logic lives in `lib/supabase/proxy.ts` (`updateSession`). Root `proxy.ts` delegates to it but is not the file Next.js invokes as middleware. TODO / Verify: rename to `middleware.ts` or wire middleware if session refresh should run on every request.
- **Roles (application-level):** Derived in app and API via `getUserRole(supabase)` from `@/lib/auth/roles`: **guest** (no user), **user** (authenticated, no vendor/admin), **vendor** (has row in `vendors`), **admin** (has row in `site_admins`). Used for route protection (e.g. manage pages, admin users) and API authorization (e.g. PATCH/DELETE activity, POST status, admin-only `/api/admin/users`).
- **Protected routes:** Server components (e.g. `/activities/manage`, `/activities/manage/[id]`, `/admin/users`) call `getUserRole()` and redirect or render “Access denied” for guest / non-vendor or non-admin as appropriate. API routes return 401/403 when role is insufficient.

## Data Layer (High-level)

- **Supabase Postgres:** Main schema in `public`. Tables: `profiles` (1:1 with `auth.users`), `vendors` (owner_user_id → auth.users), `site_admins` (user_id → auth.users), `activities` (vendor_id → vendors). Activities have text `location` (display only) and optional `location_point` (PostGIS geometry 4326) set from user-provided coordinates. Migrations include `set_activity_location_point` RPC and drop of former geocode columns.
- **RLS:** Enabled on `profiles`, `vendors`, `activities`, `site_admins`. Policies: public can select published activities; vendor can CRUD own activities; admins can manage all activities and vendors; vendors see own vendor row; site_admins table restricted to admins. Column-level grants on `activities` limit which columns authenticated users can insert/update (e.g. no `rating`, no direct write to `location_point`).
- **RPC:** `set_activity_location_point(p_activity_id, p_lng?, p_lat?)` sets or clears `location_point` (via `st_setsrid(st_makepoint(...), 4326)`). Granted to `authenticated` only. Used from the activities service when creating or updating an activity with coordinates.
- **Storage:** Bucket `activity-images` (public read). RLS: upload/update/delete scoped to vendor path `{vendor_id}/*` or site admin. Client uploads in ActivityEditClient then uses public URL for `image_url`.

## Geospatial / Maps Architecture

- **Location data:** Activity location is stored as text `location` (for display) and optional `location_point` (PostGIS Point, WGS84). Coordinates are provided by the user when creating or updating an activity (e.g. device geolocation or future map pin). The API validates latitude/longitude and the service calls the RPC `set_activity_location_point` to set or clear the point. No geocoding (address to coordinates) is used.
- **Persistence:** The RPC `set_activity_location_point(p_activity_id, p_lng?, p_lat?)` sets or clears `location_point`. GIST index on `location_point` supports future spatial queries.
- **Map UI:** No map component or map page in the repo yet. Activities list and manage UIs do not render a map. Coordinate-based flow supports future "map pins" and "near me" use.

## Background Jobs / Webhooks

None yet. No workers, no webhook handlers, no cron in repo.

## Error Handling & Observability

- **API routes:** Return JSON `{ error: string }` with appropriate status (400, 401, 403, 404, 500). Validation errors and service throws are caught and mapped to message and status (e.g. “Unauthorized”, “User is not associated with a vendor” → 403; PGRST116 → 404).
- **Service layer:** Throws `Error` with message; no centralized logger or error code.
- **Health:** `GET /api/health` returns `{ ok: true, uptime, timestamp }` for liveness.
- No structured logging or APM observed in codebase.

## Key Architectural Decisions

- **Decision: App Router only**
  - Why: Single routing model; server components for data fetching; alignment with Next.js 16.
  - Implications: No `getServerSideProps`; API routes and server components use async server Supabase client.
- **Decision: Supabase server client per-request (no global client)**
  - Why: Correct cookie handling and session with `@supabase/ssr`; “Fluid compute” / serverless-safe.
  - Implications: `createClient()` from `@/lib/supabase/server` is called in each API route and server component that needs DB/auth.
- **Decision: Role derived in application layer (not only RLS)**
  - Why: Route and API authorization need clear “admin” vs “vendor” vs “user”; RLS enforces row-level access.
  - Implications: `getUserRole(supabase)` queries `site_admins` and `vendors`; used in both server components and API routes.
- **Decision: location_point updated only via RPC (`set_activity_location_point`)**
  - Why: Single place for PostGIS geometry and SRID; column is not in the UPDATE grant for authenticated users, so the app uses an RPC to set/clear the point from user-provided coordinates.
  - Implications: App does not write `location_point` directly; create/update activity flows call the RPC when latitude/longitude are provided (or both null to clear).
- **Decision: Public activity list uses server component + direct Supabase query**
  - Why: Simple, good for SEO and first paint; list is not yet real-time.
  - Implications: `/activities` page does not call `/api/activities` for initial load; API used for programmatic or future client-side pagination.
- **Decision: Vendor-scoped storage paths (`activity-images` bucket)**
  - Why: RLS policies key off `vendor_id_for_user()` and path prefix `{vendor_id}/%`.
  - Implications: Uploads in ActivityEditClient use `vendorId` in path; admins can manage any.
- **Decision: No Map UI in initial scope**
  - Why: DB schema and coordinate flow support future maps; UI deferred.
  - Implications: Create/update accept optional coordinates; map components can be added later.
- **Decision: Middleware/session refresh in `lib/supabase/proxy`**
  - Why: Centralize Supabase cookie refresh for session continuity.
  - Implications: Root file is `proxy.ts`, not `middleware.ts`; Next.js may not run it as middleware — verify and rename or add `middleware.ts` if refresh is required on every request.

## Known Gaps / TODOs

- **Middleware filename:** Session refresh lives in `proxy.ts`; Next.js expects `middleware.ts`. Verify whether middleware runs and rename or add `middleware.ts` if needed.
- **Env key naming:** Proxy error message references `NEXT_PUBLIC_SUPABASE_ANON_KEY`; code uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — align naming and docs.
- **Protected paths:** `protectedPaths` in proxy is empty; only public paths and redirect logic are defined. If more routes need auth redirect, add them to protected list.
- **ADR link:** Key decisions above can be expanded into ADRs as needed.

