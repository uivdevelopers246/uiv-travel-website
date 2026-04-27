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

- **Server:** Next.js server (API routes, Server Components, Server Actions). Uses `createClient()` from `@/lib/supabase/server` (cookie-based Supabase client via `@supabase/ssr`). **Privileged server-only paths** (e.g. verified Stripe webhooks) use `createServiceRoleClient()` from `@/lib/supabase/service-role` with `SUPABASE_SERVICE_ROLE_KEY` — **never** exposed to the browser; bypasses RLS for controlled workflows only.
- **Client:** Browser. Uses `createClient()` from `@/lib/supabase/client` (browser client). Client components fetch from API routes or use Supabase client for auth state and storage uploads.
- **Deployment:** Assumed Vercel (signup uses `NEXT_PUBLIC_VERCEL_URL`). Supabase project is separate (hosted Supabase).

**Environment variables (used in code):**


| Variable                                          | Purpose                                                     |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                        | Supabase project URL (required at build/run)                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`            | Anon key for browser and server Supabase clients (required) |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_VERCEL_URL` | Public absolute origin: auth email redirects, Stripe Checkout `success_url` / `cancel_url` (`getPublicSiteUrl()` in `@/lib/stripe/server`). Prefer `NEXT_PUBLIC_SITE_URL` in production; on Vercel, `NEXT_PUBLIC_VERCEL_URL` is set (host without scheme — code prepends `https://`). Local dev defaults to `http://localhost:3000` when neither is set. |
| `SUPABASE_SERVICE_ROLE_KEY`                       | **Server-only** (never `NEXT_PUBLIC_*`). Privileged Supabase JWT for `createServiceRoleClient()` — webhook fulfillment and other trusted bypass-RLS paths only; not for normal user requests. In the Supabase Dashboard this value may be labeled the **Secret** API key (replacing legacy **service_role**); it must **not** be the publishable key. |
| `STRIPE_SECRET_KEY`                               | **Server-only.** Stripe API (`getStripe()` in `@/lib/stripe/server`): Checkout Session, refunds. Restricted keys need at least **Checkout Sessions (write)** and **Charges and Refunds (write)**. See `docs/adrs/ADR-M4-shopping-cart-and-checkout.md`. |
| `STRIPE_WEBHOOK_SECRET`                           | **Server-only.** Webhook signing secret (`whsec_…`) for `stripe.webhooks.constructEvent` on `POST /api/webhooks/stripe` (`getStripeWebhookSecret()` in `@/lib/stripe/server`). Must match the Stripe **Test** or **Live** mode and endpoint used to register the webhook (CLI secret ≠ Dashboard production endpoint secret). |
| `CRON_SECRET`                                     | **Server-only.** Shared secret for **`GET /api/cron/pending-approval-expiry`**: caller must send **`Authorization: Bearer <CRON_SECRET>`**. On Vercel, set in Project → Environment Variables; Vercel Cron includes this header automatically when the variable is defined. |

**Booking & checkout (M4):** See `docs/adrs/ADR-M4-booking-availability.md` (slots, `activity_bookings`, capacity RPC), `docs/adrs/ADR-M4-shopping-cart-and-checkout.md` (cart, `orders`, Stripe webhook fulfillment), and `docs/adrs/ADR-M4-C-pending-approval-checkout-and-payment.md` (save payment method first, charge once at settlement). **`activity_bookings` rows are inserted only through privileged server paths** (Stripe webhook with **service role** after signature verification on setup completion, or site admin); the **`authenticated`** role has **no** `INSERT` policy on that table, so the publishable key cannot mint booking rows without that path. **M4-C settlement:** after checkout **setup** (`mode: setup`), the order is **`awaiting_vendor_approval`** and lines are **`pending_approval`** until vendors resolve them. When **every** line is terminal and at least one is **`confirmed`**, `lib/orders/settlement.ts` **`tryBeginSettlementChargeForOrder`** creates **one** off-session **`PaymentIntent`** (sum of confirmed line totals). **Ordering note (create vs attach vs webhook):** because creation uses `confirm: true`, Stripe can emit `payment_intent.succeeded` before the app finishes attaching the new PI id to the order row; fulfillment therefore allows transition from `awaiting_vendor_approval`/`payment_pending`, and settlement start must not cancel a succeeded or already order-bound PI when an attach race is detected. **`payment_intent.succeeded`** on that intent (metadata `flow: m4c_settlement`) transitions the order to **`paid`** via `lib/stripe/server.ts` **`fulfillSettlementPaymentIntentSucceeded`** → `updateOrderPaidAfterSettlementCapture` when the captured amount and currency match the app’s expected settlement total (`computeConfirmedSettlementTotalCents` over confirmed bookings) and the order’s currency. **Settlement amount or currency mismatch:** if Stripe’s captured values differ, the order is moved to **`reconciliation_required`** by `markOrderReconciliationRequiredAfterSettlementMismatch` in `lib/orders/service.ts` (only when the intent id still matches `orders.stripe_payment_intent_id` and the order is still **`awaiting_vendor_approval`** or **`payment_pending`**). That path is treated as a **non-retryable data-integrity** outcome: the webhook handler still records the event in **`stripe_webhook_events`**, returns result **`reconciliation_required`**, and **`POST /api/webhooks/stripe`** responds **200** with `{ received: true }` so Stripe stops retrying while operations investigates (compare Dashboard charge vs bookings/order, refund or correct data per your playbook). Migrations add **`public.order_settlement_mismatches`** for structured mismatch snapshots keyed by Stripe event id when you need a durable audit row beyond the order status and webhook log. **Read/cancel APIs** live under `src/app/api/activity-bookings` (consumer), `src/app/api/vendor/activity-bookings` (vendor-only list/detail), and `src/app/api/admin/activity-bookings` (admin list + PATCH to `completed`); handlers call `lib/activity-bookings/service.ts` with the cookie-based server client (RLS applies).

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

- **M4-C SLA expiry (no new charge):** `GET /api/cron/pending-approval-expiry` requires **`Authorization: Bearer $CRON_SECRET`** and uses **`createServiceRoleClient()`** to call **`expire_pending_activity_bookings`** once. That RPC both expires rows and returns **`expired_count`** plus distinct **`order_ids`** from the same database transaction (no separate client-side list query vs **`now()`**). The cron then runs **`syncOrderDeclinedWhenNoPendingHoldsRemain`** for each returned order (sets **`orders.status = declined`** when no **`pending_approval`** remains and every booking is **`declined` / `expired` / `cancelled`**). Scheduled in **`vercel.json`** (e.g. every 15 minutes). Expiry can lead into settlement when other lines are already resolved (via the same post-transition hooks that call **`tryBeginSettlementChargeForOrder`** from vendor-approval flows).
- **M4-C admin bulk decline:** **`declineActivityOrderAsAdmin`** in **`lib/orders/vendor-approval.ts`** uses the same **`syncOrderM4cAfterBookingChange`** hook as vendor approve/decline paths (not a direct **`orders.status = declined`** update), so **`syncOrderDeclinedWhenNoPendingHoldsRemain`** and **`tryBeginSettlementChargeForOrder`** apply consistently when an order still has **confirmed** lines after pendings are declined.
- **Stripe:** `POST /api/webhooks/stripe` verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`, then uses **`createServiceRoleClient()`** for DB work (orders, pending `activity_bookings` after Checkout **setup**, cart clearing, idempotency in `stripe_webhook_events`). **M4-C setup:** handle **`checkout.session.completed`** (setup mode) and **`setup_intent.succeeded`** so the saved payment method and order state are recorded. **M4-C settlement:** handle **`payment_intent.succeeded`** and **`payment_intent.payment_failed`** for PaymentIntents whose **`metadata.flow`** is **`m4c_settlement`** (see `fulfillSettlementPaymentIntentSucceeded` / `fulfillSettlementPaymentIntentPaymentFailed` in `lib/stripe/server.ts`); success marks the order **`paid`** when totals align; **amount/currency mismatch** marks **`reconciliation_required`** and still **acks (200)** after recording **`stripe_webhook_events`**; failure may schedule **one** retry PI then terminal **`failed`**. Stripe retries on non-2xx responses.
  - **Webhook retry policy (ack vs retry):**
    - Return **`200`** for **non-retryable data/business-state outcomes** after best-effort event recording in `stripe_webhook_events` (for example: invalid or missing metadata, order missing, order not eligible for the transition, settlement amount/currency mismatch mapped to `reconciliation_required`). This acknowledges receipt and stops Stripe retries.
    - Return **`500`** only for **retry-desirable transient/system failures** (for example: temporary DB/network faults, Stripe API unavailability, or inability to persist the webhook event record). This allows Stripe's retry schedule to re-deliver the event.
    - Return **`400`** for signature verification failures (`Stripe-Signature`/payload mismatch); these are rejected and should not be retried as a processing strategy.
  - **Manual follow-up expectations for acknowledged non-retryables:**
    - Use structured webhook logs plus `stripe_webhook_events` rows (`event_id`, `event_type`, mapped reason/result, and `order_id` when present) as the source of truth for triage.
    - Investigate and remediate in ops playbooks (for example: compare Stripe Dashboard objects vs `orders`/`activity_bookings`, then refund, correct data, or move order state as appropriate).
    - Treat `reconciliation_required` as a manual-work queue signal rather than an auto-retry candidate; webhook delivery has succeeded by design when this state is produced.
  - **Route URL:** The App Router file `src/app/api/webhooks/stripe/route.ts` maps to **`/api/webhooks/stripe`** (HTTPS only in production).
  - **Production (e.g. Vercel):** Register a **Webhook endpoint** destination in the Stripe Dashboard (**Workbench** or **Developers → Webhooks**, depending on UI) with URL `https://<your-public-host>/api/webhooks/stripe`, where `<your-public-host>` is the project’s default `*.vercel.app` domain or a **custom domain** listed under Vercel **Project → Settings → Domains**. Subscribe at minimum to **`checkout.session.completed`** and **`setup_intent.succeeded`** (M4-C setup flow). Copy the endpoint **signing secret** into `STRIPE_WEBHOOK_SECRET` for the same environment (Test vs Live must match the Dashboard mode and `STRIPE_SECRET_KEY`). Set all related env vars on Vercel **Project → Settings → Environment Variables** and redeploy if the runtime should pick up new secrets.
  - **Local testing:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (adjust host/port as needed); use the CLI-printed `whsec_` as `STRIPE_WEBHOOK_SECRET` for that session.

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
- **Decision: M4-C single settlement `PaymentIntent` per order (ADR-M4-C)**
  - Why: Checkout collects a payment method only; vendors approve or decline per booking line; the customer is charged **once** for the **sum of confirmed** lines after every line is terminal, avoiding per-vendor PaymentIntents.
  - Implications: `orders.stripe_payment_intent_id` holds the active settlement PI; `settlement_charge_attempt_count` distinguishes first charge vs one retry; `metadata.flow = m4c_settlement` on the PI ties webhooks to this path; `lib/orders/settlement.ts` and `lib/stripe/server.ts` implement creation and fulfillment.
- **Decision: Settlement capture mismatch → `reconciliation_required` + webhook 200**
  - Why: A succeeded Stripe capture that does not match computed booking totals is an operational integrity signal, not something fixed by Stripe retries; leaving the order in **`payment_pending`** would hide the problem.
  - Implications: Explicit terminal-ish order state for support; **`stripe_webhook_events`** insert preserves idempotency; route maps `reconciliation_required` fulfillment result to **200**; manual reconciliation compares Stripe, `orders`, and `activity_bookings` (optional use of **`order_settlement_mismatches`** from migrations for structured audit rows).

## Known Gaps / TODOs

- **Protected paths:** `protectedPaths` in `lib/supabase/proxy.ts` is empty; auth redirects for anonymous users are not applied globally—server components and API routes enforce access per route. Add paths here if you want proxy-level redirects to login.
- **ADR link:** Key decisions above can be expanded into ADRs as needed.

