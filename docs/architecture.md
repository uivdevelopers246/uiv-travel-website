## System Overview

UIV Travel is a Barbados-focused travel site where **vendors** list **activities** (water sports, wildlife, adventure, culture, nature) and **accommodations** (lodging listings). **Public** users browse published activities and accommodations; **admins** manage users and vendors. The app is a single Next.js application using the App Router, with Supabase for auth, Postgres (with PostGIS), and storage. Activity and accommodation map pins use user-provided coordinates via Postgres RPCs (`set_activity_location_point`, `set_accommodation_location_point`); no map UI is present in the repo yet.

## Tech Stack

- **Runtime:** Node.js (Next.js 16)
- **Framework:** Next.js 16 (App Router only; no Pages Router)
- **Backend / BaaS:** Supabase
  - Auth (email OTP), Postgres, Row Level Security (RLS), Storage (`activity-images`, `accommodation-images` buckets)
  - PostGIS extension enabled for `activities.location_point` and `accommodations.location_point`
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
| `STRIPE_SECRET_KEY`                               | Server-only; Stripe API (Checkout Session, refunds). Planned for M4 — see `docs/adrs/ADR-M4-shopping-cart-and-checkout.md` |
| `STRIPE_WEBHOOK_SECRET`                           | Server-only; verifies `stripe-signature` on `/api/webhooks/stripe`. Planned for M4 |

**Booking & checkout (M4):** See `docs/adrs/ADR-M4-booking-availability.md` (slots, `activity_bookings`, capacity RPC) and `docs/adrs/ADR-M4-shopping-cart-and-checkout.md` (cart, `orders`, Stripe webhook fulfillment). **`activity_bookings` rows are inserted only through privileged server paths** (Stripe webhook with **service role** after signature verification, or site admin); the **`authenticated`** role has **no** `INSERT` policy on that table, so the publishable key cannot mint paid bookings without payment fulfillment. **Read/cancel APIs** live under `src/app/api/activity-bookings` (consumer), `src/app/api/vendor/activity-bookings` (vendor-only list/detail), and `src/app/api/admin/activity-bookings` (admin list + PATCH to `completed`); handlers call `lib/activity-bookings/service.ts` with the cookie-based server client (RLS applies).

## Request/Response Flows

- **Public user browsing activities**
  1. User requests `/activities`.
  2. Next.js runs the server component `ActivitiesPage`; it calls `createClient()` from `@/lib/supabase/server`.
  3. Server queries `activities` with `status = 'published'`, selects public columns and `vendors(name)`.
  4. RLS allows anonymous/authenticated read for rows where `status = 'published'` (or vendor/admin visibility).
  5. Server renders `ActivitiesClient` with the fetched list; client handles filters and role (for “Manage activities” link).
  6. Optional: client calls `GET /api/activities` (e.g. for limit/offset); same server `createClient()` and `listActivities()` from `@/lib/activities/service`; response JSON list of public activities.
- **Public user browsing accommodations (e.g. vacation planning)**
  1. Pages such as `/vacation-planning` query `accommodations` with `status = 'published'`, joining `vendors(name)` where needed.
  2. RLS allows anon/authenticated read for published rows; vendors and admins see drafts for their listings.
- **Vendor creating/updating an activity**
  1. Vendor is authenticated; they open `/activities/manage` or `/activities/manage/[id]`.
  2. Server component uses `createClient()` and `getUserRole()`; redirects guest to login; allows only admin/vendor into manage pages.
  3. **Create:** Client submits to `POST /api/activities`. Route uses server `createClient()`, validates body (including optional `latitude`/`longitude`), then `createActivity(supabase, input)`. Service resolves vendor, inserts into `activities`, and if valid coordinates are provided calls `set_activity_location_point` RPC to set the map pin. Text `location` is stored for display only.
  4. **Update:** Client submits to `PATCH /api/activities/[id]`. Route uses `getUserRole()` and `updateActivity(supabase, id, updates)`. Service checks vendor ownership and updates allowed columns. If `latitude`/`longitude` are provided (or both null to clear), the service calls `set_activity_location_point` RPC. No geocoding is used.
  5. RLS on `activities` restricts INSERT/UPDATE to the owning vendor or site admin; column grants restrict writable columns (e.g. no direct write to `rating` or `location_point`).
- **Vendor creating/updating an accommodation**
  1. Vendor or admin opens manage UI under `/my-listings/manage/accommodations` (list and `/[id]` edit).
  2. **Create:** `POST /api/accommodations` → `createAccommodation` in `@/lib/accommodations/service`; optional coordinates call `set_accommodation_location_point`.
  3. **Update:** `PATCH /api/accommodations/[id]` → `updateAccommodation`; coordinates or nulls call the same RPC. `location_point` is not written directly.
  4. Images use bucket `accommodation-images` with vendor-scoped paths (`{vendor_id}/...`), mirroring activities.
- **Vendor profile (business intake fields)**
  1. Vendors can update profile columns on their own `vendors` row (name, contact, incorporation fields, etc.) via `PATCH /api/vendors/me` (see `lib/vendors/service.ts`). Column grants and RLS restrict which columns apply; admins retain full vendor management.

## Auth & Authorization Model (High-level)

- **Auth:** Supabase Auth. Email OTP (magic link / OTP). Signup uses `signInWithOtp`; confirmation is handled by `GET /auth/confirm` (verifies `token_hash` and `type`, then redirects). **Next.js 16** uses root **`proxy.ts`** (export `proxy`) instead of `middleware.ts` for the same role: it calls `updateSession` from `lib/supabase/proxy.ts` so Supabase cookies/session refresh run on matched routes. The `config.matcher` in `proxy.ts` defines which paths run through this layer.
- **Roles (application-level):** Derived in app and API via `getUserRole(supabase)` from `@/lib/auth/roles`: **guest** (no user), **user** (authenticated, no vendor/admin), **vendor** (has row in `vendors`), **admin** (has row in `site_admins`). Used for route protection (e.g. manage pages, admin users) and API authorization (e.g. PATCH/DELETE activity, POST status, admin-only `/api/admin/users`, vendor-only `/api/vendor/activity-bookings`, admin-only `/api/admin/activity-bookings`).
- **Protected routes:** Server components (e.g. `/activities/manage`, `/activities/manage/[id]`, `/admin/users`) call `getUserRole()` and redirect or render “Access denied” for guest / non-vendor or non-admin as appropriate. API routes return 401/403 when role is insufficient.

## Data Layer (High-level)

- **Supabase Postgres:** Main schema in `public`. Tables: `profiles` (1:1 with `auth.users`), `vendors` (owner + optional business profile columns), `site_admins` (user_id → auth.users), `activities` and **`accommodations`** (both `vendor_id → vendors`), plus M4 **`orders`**, **`availability_slots`**, and **`activity_bookings`** for paid activity bookings. Activities have text `location` (display) and optional `location_point`. Accommodations have address/parish fields and optional `location_point`. Location geometry is set only via RPCs, not direct column writes from the app.
- **RLS:** Enabled on `profiles`, `vendors`, `activities`, `accommodations`, `site_admins`. Policies mirror the activities model for accommodations (published public read; vendor/admin for own rows). **Vendors:** owners can read/insert/update their row (subject to column grants); admins retain elevated policies from consolidated migrations. Column-level grants on `activities` and `accommodations` limit inserts/updates (e.g. no `rating` on activities; no `location_point` or `is_featured` on accommodations for authenticated direct writes). **M4:** `activity_bookings` allows **select** for owners, vendors, and admins; **`authenticated` has no insert policy** — webhook fulfillment uses **service role** (see ADRs).
- **RPCs:** `set_activity_location_point` and `set_accommodation_location_point` set or clear PostGIS points (`st_setsrid(st_makepoint(...), 4326)`). Granted to `authenticated` only; underlying UPDATE still enforced by RLS. **M4:** `create_activity_booking_after_payment` (atomic slot lock + capacity check + insert, `SECURITY DEFINER`, **service_role** only), `cancel_activity_booking` (user cancel, `SECURITY DEFINER`).
- **Storage:** Buckets `activity-images` and `accommodation-images` (public read). RLS: paths under `{vendor_id}/%` for the owning vendor or site admin. Clients upload then store the public URL on the row (`image_url`).

## Geospatial / Maps Architecture

- **Location data:** Activities use text `location` plus optional `location_point`. Accommodations use address/parish text fields plus optional `location_point`. Coordinates are user-provided on create/update; services call `set_activity_location_point` or `set_accommodation_location_point`. No server-side geocoding from addresses is implemented in-repo.
- **Persistence:** Same RPC pattern for both entities; GIST indexes on each table’s `location_point` support future spatial queries.
- **Map UI:** No map component or dedicated map page yet. Manage flows can still capture coordinates for future map display.

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
- **Decision: location_point updated only via RPCs (`set_activity_location_point`, `set_accommodation_location_point`)**
  - Why: Single place for PostGIS geometry and SRID; columns are not in the normal UPDATE grants for authenticated users.
  - Implications: Create/update flows in `lib/activities/service.ts` and `lib/accommodations/service.ts` call the appropriate RPC when coordinates are provided or cleared.
- **Decision: Public activity list uses server component + direct Supabase query**
  - Why: Simple, good for SEO and first paint; list is not yet real-time.
  - Implications: `/activities` page does not call `/api/activities` for initial load; API used for programmatic or future client-side pagination.
- **Decision: Vendor-scoped storage paths (`activity-images`, `accommodation-images`)**
  - Why: RLS policies key off `vendor_id_for_user()` and path prefix `{vendor_id}/%`.
  - Implications: Upload components use `vendorId` in the object path; admins can manage any.
- **Decision: No Map UI in initial scope**
  - Why: DB schema and coordinate flow support future maps; UI deferred.
  - Implications: Create/update accept optional coordinates; map components can be added later.
- **Decision: `activity_bookings` inserts are webhook / admin only at the DB**
  - Why: Enforces “paid before confirmed booking” for normal users; prevents authenticated clients from inserting reservation rows without going through Stripe fulfillment.
  - Implications: Verified `/api/webhooks/stripe` uses a **service-role** Supabase client and `create_activity_booking_after_payment` (not user JWT inserts). User cancellation uses `POST /api/activity-bookings/[id]/cancel` → `cancel_activity_booking` RPC. See ADR-M4-A / ADR-M4-B and `docs/database.md`.
- **Decision: Session refresh via Next.js 16 `proxy.ts` + `lib/supabase/proxy`**
  - Why: Next.js 16 replaces `middleware.ts` with `proxy.ts` for the network boundary; Supabase SSR still needs per-request cookie refresh (`getClaims()` after `createServerClient`).
  - Implications: Keep `proxy.ts` matcher in sync with routes that need refreshed sessions; implementation lives in `updateSession`.

## Known Gaps / TODOs

- **Protected paths:** `protectedPaths` in `lib/supabase/proxy.ts` is empty; auth redirects for anonymous users are not applied globally—server components and API routes enforce access per route. Add paths here if you want proxy-level redirects to login.
- **ADR link:** Key decisions above can be expanded into ADRs as needed.

