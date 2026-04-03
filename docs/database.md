## Overview

The database is Supabase Postgres in the `public` schema, with PostGIS in `extensions`. It backs a Barbados travel app: **profiles** (1:1 with auth users), **vendors** (one per owner, with optional business profile columns), **site_admins** (admin users), **activities**, and **accommodations** (vendor-owned listings with optional map pins). **M4** adds **`orders`**, **`availability_slots`**, and **`activity_bookings`** for paid activity checkout and slot capacity (see ADRs in `docs/adrs/`). RLS is enabled on all application tables; policies evolved across migrations (see Migration Workflow). Column-level grants on `activities` and `accommodations` restrict which columns authenticated users can write. `location_point` on activities and accommodations is set or cleared only via **`set_activity_location_point`** and **`set_accommodation_location_point`** RPCs using user-provided coordinates (no geocoding in migrations). **`activity_bookings`:** ordinary **`authenticated` users have no `INSERT` policy**; rows are created by the **Stripe webhook** using the **service role** (and by site admins via `FOR ALL`), per ADR-M4-A / ADR-M4-B.

## Core Tables

### public.profiles

Extends Supabase Auth: one row per `auth.users` row. Holds display name, avatar, bio and audit fields. Created by trigger on signup.

| Item | Detail |
|------|--------|
| **Primary key** | `id` (uuid, FK to `auth.users(id)` ON DELETE CASCADE) |
| **Important columns** | `display_name`, `avatar_url`, `bio`; `created_at`, `updated_at` (not null, default `now()`); `created_by`, `updated_by` (uuid, nullable) |
| **Conventions** | `created_at`/`updated_at` set by trigger `handle_audit_fields_on_profiles` (and table defaults). No status/enum. |

### public.vendors

A vendor account; one per owner. Owner is `auth.users.id`. Optional **business intake** columns (nullable): `owner_full_name`, `business_phone`, `personal_phone`, `contact_email`, `is_incorporated`, `country_of_incorporation`, `business_registration_number`.

| Item | Detail |
|------|--------|
| **Primary key** | `id` (uuid, default `gen_random_uuid()`) |
| **Important columns** | `name` (text not null), `owner_user_id` (uuid not null unique, FK to `auth.users(id)` ON DELETE CASCADE), profile fields above, `created_at`, `updated_at` (timestamptz not null default `now()`) |
| **Conventions** | `updated_at` maintained by trigger `trg_vendors_set_updated_at`. Column-level INSERT/UPDATE grants list which columns `authenticated` may write (see migration `20260324120000_accommodations_and_vendor_profile.sql`). |

### public.site_admins

Marks a user as site admin. Existence of a row implies admin role.

| Item | Detail |
|------|--------|
| **Primary key** | `user_id` (uuid, FK to `auth.users(id)` ON DELETE CASCADE) |
| **Important columns** | `created_at` (timestamptz not null default `now()`) |
| **Conventions** | No updated_at; no status/enum. |

### public.activities

Vendor-owned activity listing (tours, experiences). Can have a text `location` (display only) and an optional PostGIS point for map pins.

| Item | Detail |
|------|--------|
| **Primary key** | `id` (uuid, default `gen_random_uuid()`) |
| **Important columns** | `vendor_id` (uuid not null, FK to `vendors(id)` ON DELETE CASCADE), `title` (text not null), `description`, `location` (text, for display), `category` (text not null), `duration_hours` (numeric), `price_per_person` (numeric), `max_capacity` (integer), `rating` (numeric), `image_url`, `is_featured` (boolean not null default false), `status` (text not null default 'draft'), `created_at`, `updated_at` (timestamptz not null default `now()`). Geospatial: `location_point` (geometry(Point, 4326), WGS84). |
| **Enums / status** | `category` check: `'water-sports' | 'wildlife' | 'adventure' | 'culture' | 'nature'`. `status` check: `'draft' | 'published' | 'archived'`. |
| **Conventions** | `updated_at` set by trigger `trg_activities_set_updated_at`. `rating` and `location_point` are not in the INSERT/UPDATE grant list for `authenticated` — rating is system-only; `location_point` is set only via RPC. |

### public.accommodations

Vendor-owned accommodation listing (lodging). Parity with activities for status workflow and optional PostGIS pin.

| Item | Detail |
|------|--------|
| **Primary key** | `id` (uuid, default `gen_random_uuid()`) |
| **Important columns** | `vendor_id` (uuid not null, FK to `vendors(id)` ON DELETE CASCADE), `name`, `accommodation_type` (text not null; app-level validation), counts (`bedroom_count`, `bed_count`, `bathroom_count`, `max_guest_capacity`), `price_min_usd` / `price_max_usd` (range constraint), `check_in_time`, `check_out_time`, boolean amenity flags (`suitable_for_children`, `wheelchair_accessible`, `smoking_allowed`, `pets_allowed`, `beach_access_or_view`, `transportation_provided`, `amenities_complete`), `amenities` (text array), `address`, `parish`, `transportation_notes`, `pickup_notes`, `image_url`, `is_featured` (boolean; not in authenticated insert/update grants—set by admin/system only), `location_point` (geometry Point 4326), `status` (`draft` \| `published` \| `archived`), `created_at`, `updated_at` |
| **Conventions** | `updated_at` via `trg_accommodations_set_updated_at`. `location_point` set only via `set_accommodation_location_point` RPC. |

## Relationships & Ownership Model

- **profiles** → `id` = `auth.users.id` (1:1).
- **vendors** → `owner_user_id` = `auth.users.id` (many-to-one from auth; app treats one vendor per user).
- **site_admins** → `user_id` = `auth.users.id` (many-to-one; app uses “is admin” by existence of row).
- **activities** → `vendor_id` = `vendors.id` (many activities per vendor).
- **accommodations** → `vendor_id` = `vendors.id` (many accommodations per vendor).

Ownership for RLS: activity and accommodation rows are “owned” by the vendor; the vendor is identified by `auth.uid()` = `vendors.owner_user_id`. Admins bypass ownership via `is_site_admin()`.

## RLS Policies Summary

Policies below reflect the consolidated vendors/activities migration (`20260129022541`) plus later additions: **accommodations** (`20260324120000_accommodations_and_vendor_profile.sql`) and **vendor owner self-update** on `vendors`. Column-level grants: `activities` (`20260119233304` + later), `accommodations` and `vendors` (`20260324120000`).

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| **activities** | **anon, authenticated:** published rows OR (authenticated and (vendor owner of row OR site admin)). | **authenticated:** with check vendor owner of `vendor_id` OR site admin. | **authenticated:** using/with check vendor owner of row OR site admin. | **authenticated:** using vendor owner of row OR site admin. |
| **accommodations** | **anon, authenticated:** published rows OR (authenticated and (vendor owner of row OR site admin)). | **authenticated:** with check vendor owner of `vendor_id` OR site admin. | **authenticated:** using/with check vendor owner of row OR site admin. | **authenticated:** using vendor owner of row OR site admin. |
| **vendors** | **authenticated:** own row (`owner_user_id` = auth.uid()) OR site admin. | **authenticated:** with check owner inserting for self OR site admin. | **authenticated:** site admin **or** vendor owner updating own row (`20260324120000`: policy `"Vendors update (owner)"` alongside `"Vendors update (admins only)"`). | **authenticated:** using site admin only. |
| **site_admins** | **authenticated:** own row (`user_id` = auth.uid()) for “read self”; “table access” policy: using/with check site admin for all. | Same “table access” policy (site admin only). | Same. | Same. |
| **profiles** | **authenticated:** own profile (`id` = auth.uid()); plus policy “Site admins can view all profiles” (authenticated, using is_site_admin()). | **authenticated:** with check own profile (`id` = auth.uid()). | **authenticated:** using/with check own profile. | (No delete policy in migrations; default deny.) |

- **Security definer:** `is_site_admin()`, `is_vendor_user()`, `vendor_id_for_user()` and trigger functions `handle_new_user()`, `handle_audit_fields()` are `security definer` so they run with definer rights (e.g. read `site_admins`/`vendors` for RLS). `is_vendor_owner(v_id)` is not security definer; it runs as invoker and relies on RLS.
- **RPCs:** `set_activity_location_point` and `set_accommodation_location_point` are revoked from `public` and granted to `authenticated`. Neither RPC checks ownership in SQL; RLS on the target table applies to the underlying UPDATE, so only vendor owners or admins can change rows they are allowed to update.

### M4: `availability_slots`, `activity_bookings`, `orders`

| Table | Notes |
|-------|--------|
| **`availability_slots`** | Vendor/admin manage slots; public **select** for non-cancelled slots tied to **published** activities (see `20260403120400_rls_availability_slots.sql`). |
| **`activity_bookings`** | **Select:** booking owner (`user_id`), vendor owner (`is_vendor_owner(vendor_id)`), site admin. **`INSERT`:** not allowed for **`authenticated`** — use **service role** in the Stripe webhook (or admin `FOR ALL`). **User cancel:** `cancel_activity_booking` RPC (`SECURITY DEFINER`). **`reserve_slot_capacity`** is `SECURITY DEFINER`; called before insert on the webhook path. |
| **`orders`** | RLS enabled in migration; detailed policies may follow in `rls_orders` (ADR-M4-B). |

## Database Functions (RPC + helpers)

### RPC (callable from app)

| Function | Purpose | Args | Optional / defaults | Permissions | Notes |
|----------|---------|------|---------------------|-------------|--------|
| **set_activity_location_point** | Set or clear an activity’s geographic point (user-provided coordinates). | `p_activity_id` uuid; `p_lng`, `p_lat` double precision. | `p_lng` and `p_lat` default to null. | `authenticated` only (execute granted; public revoked). | If `p_lng` or `p_lat` is null, clears `location_point`; otherwise sets point via `st_setsrid(st_makepoint(p_lng, p_lat), 4326)`. UPDATE is subject to RLS. |
| **set_accommodation_location_point** | Set or clear an accommodation’s geographic point. | `p_accommodation_id` uuid; `p_lng`, `p_lat` double precision. | Defaults null. | `authenticated` only. | Same clear/set semantics as activities; targets `accommodations.location_point`. |
| **reserve_slot_capacity** | Serialize capacity check before inserting a booking (sum of `confirmed` participants vs slot `max_capacity`). | `p_slot_id` uuid; `p_participants` integer. | — | `authenticated`, `service_role` (see migration). | `SECURITY DEFINER`; locks slot row `FOR UPDATE`. |
| **cancel_activity_booking** | User sets own `confirmed` booking to `cancelled`. | `p_booking_id` uuid. | — | `authenticated`, `service_role`. | `SECURITY DEFINER`; triggers `updated_at` on the row. |

### RLS helper functions (used in policies)

| Function | Purpose | Args | Permissions | Notes |
|----------|---------|------|-------------|--------|
| **is_site_admin()** | True if current user has a row in `site_admins`. | None. | Runs as definer. | `stable`, `security definer`, `search_path = pg_catalog, public`. |
| **is_vendor_owner(v_id uuid)** | True if current user owns the vendor `v_id`. | `v_id` — vendor id. | Invoker. | `stable`; used in activities policies. |
| **is_vendor_user()** | True if current user owns any vendor. | None. | Runs as definer. | `stable`, `security definer`. |
| **vendor_id_for_user()** | Returns the vendor id for the current user (one row). | None. | Runs as definer. | `stable`, `security definer`; used in storage policies (path prefix). |

### Trigger functions (not called directly by app)

| Function | Purpose | Used by |
|----------|---------|--------|
| **handle_new_user()** | After insert on `auth.users`, inserts a row into `profiles` (id, display_name from email, created_by/updated_by). | Trigger `on_auth_user_created` on `auth.users`. |
| **handle_audit_fields()** | Sets `created_at`, `updated_at`, `created_by`, `updated_by` on insert/update (uses `auth.uid()` when available). | Trigger `handle_audit_fields_on_profiles` on `profiles`. |
| **set_updated_at()** | Sets `new.updated_at = now()`. | Triggers on `vendors` and `activities` before update. |

## Geospatial Data (PostGIS)

- **Extension:** PostGIS in schema `extensions` (migration `20251227203101`).
- **Type:** `geometry(Point, 4326)` on `public.activities.location_point` and `public.accommodations.location_point` (WGS84).
- **How set:** Only via RPCs `set_activity_location_point` and `set_accommodation_location_point`. The app does not insert/update `location_point` directly on either table; columns are excluded from normal UPDATE grants for `authenticated`. Coordinates are user-provided on create/update; services in `lib/activities/service.ts` and `lib/accommodations/service.ts` call the RPCs. Activity text `location` and accommodation `address`/`parish` are for display and are not used to derive the point in current migrations.
- **Clearing:** RPC clears `location_point` when `p_lng` or `p_lat` is null (e.g. PATCH with `latitude: null, longitude: null`).
- **Indexes:** GIST `idx_activities_location_point` on `activities(location_point)`; GIST `idx_accommodations_location_point` on `accommodations(location_point)`.
- **“Near” queries:** No distance/near queries in app code yet; indexes support future `ST_DWithin` / `ST_Distance` patterns.

## Indexes & Performance Notes

| Index | Table | Columns | Purpose |
|-------|--------|---------|---------|
| (PK) | activities | id | Lookup by id. |
| (PK) | vendors | id | Lookup. |
| (PK) | site_admins | user_id | Lookup. |
| (PK) | profiles | id | Lookup. |
| idx_activities_vendor_id | activities | vendor_id | Filter by vendor. |
| idx_activities_status | activities | status | Filter published/draft/archived. |
| idx_activities_vendor_created_at | activities | vendor_id, created_at DESC | Vendor’s activities by newest. |
| idx_activities_location_point | activities | location_point (GIST) | Spatial “near me” / map queries. |
| idx_accommodations_vendor_id | accommodations | vendor_id | Filter by vendor. |
| idx_accommodations_status | accommodations | status | Filter published/draft/archived. |
| idx_accommodations_vendor_created_at | accommodations | vendor_id, created_at DESC | Vendor listings by newest. |
| idx_accommodations_location_point | accommodations | location_point (GIST) | Spatial queries. |

Unique: `vendors.owner_user_id` (one vendor per user).

## Migration Workflow

Migrations live under `supabase/migrations/` and are applied in filename order (timestamp prefix). Typical commands: `supabase db push` (apply), `supabase db reset` (reset and re-apply). Seed via `tsx scripts/seed.ts` (separate from migrations).

**Order (as in repo):**

1. `20251214212323_create_profiles_table.sql` — profiles table.
2. `20251214215219_signup_trigger.sql` — handle_new_user trigger on auth.users.
3. `20251214212911_audit_triggers.sql` — handle_audit_fields on profiles.
4. `20251214220404_profiles_rls_and_policies.sql` — RLS on profiles (own row only).
5. `20251227203101_remote_schema.sql` — PostGIS extension.
6. `20260119225532_create_vendors_and_activities.sql` — vendors, site_admins, activities; triggers set_updated_at; RLS helpers (is_site_admin, is_vendor_owner, is_vendor_user, vendor_id_for_user); indexes on activities.
7. `20260119233304_rls_vendors_and_activities.sql` — RLS on vendors, activities, site_admins; column revoke/grant on activities (insert/update only on listed columns).
8. `20260129022541_rls_vendors_activities_consolidated.sql` — Drops and recreates RLS policies (activities, vendors, site_admins, profiles); storage bucket and storage policies for `activity-images`. Does not change column grants.
9. `20260216123729_add_location_point_and_quality.sql` — Adds activities columns: location_point, geocode_accuracy, geocode_feature_id, geocode_label; check on geocode_accuracy; GIST index on location_point.
10. `20260219012002_create_activity_location_point.sql` — Defines set_activity_location_point (sets or clears location_point from p_lng/p_lat); revoke/grant execute.
11. `20260221222439_drop_geocode_columns_and_constraints.sql` — Drops geocode_accuracy, geocode_label, geocode_feature_id and their check constraint; location_point remains.
12. `20260324120000_accommodations_and_vendor_profile.sql` — Vendor profile columns on `vendors`; `accommodations` table, indexes, triggers; `set_accommodation_location_point` RPC; RLS on `accommodations`; vendor owner UPDATE policy and column grants on `vendors` and `accommodations`.
13. `20260325120000_accommodation_images_bucket.sql` — Storage bucket `accommodation-images` and policies (mirror `activity-images` path pattern).
14. `20260403120000_create_orders.sql` — `orders` table (checkout aggregate; RLS enabled).
15. `20260403120100_create_availability_slots.sql` — `availability_slots` + vendor/activity consistency trigger.
16. `20260403120200_create_activity_bookings.sql` — `activity_bookings` + indexes + `updated_at` trigger.
17. `20260403120300_reserve_slot_capacity_rpc.sql` — `reserve_slot_capacity` (`SECURITY DEFINER`).
18. `20260403120400_rls_availability_slots.sql` — RLS on `availability_slots`.
19. `20260403120500_rls_activity_bookings.sql` — RLS on `activity_bookings`; `cancel_activity_booking` RPC.
20. `20260403120600_activity_bookings_webhook_only_insert.sql` — Drops legacy `authenticated` INSERT policy on `activity_bookings` if present.

## Common Query Patterns (from the codebase)

- **List published activities (public):** `from('activities').select(<public columns>).eq('status','published').order('created_at', { ascending: false }).range(offset, offset+limit-1)` (service and activities page). Activities page also selects `vendors(name)` in same query.
- **Get one published activity by id:** `from('activities').select(<public columns>).eq('id', id).eq('status','published').maybeSingle()`.
- **Vendor/admin manage list:** `from('activities').select('id,vendor_id,title,status,created_at').eq('vendor_id', vendorId).order('created_at', { ascending: false })` (or without vendor filter for admin). Vendors list: `from('vendors').select('id,name')`.
- **Resolve vendor for current user:** `from('vendors').select('id').eq('owner_user_id', userId).maybeSingle()` (used before insert/update/delete activity).
- **Create activity:** `from('activities').insert({ vendor_id, title, description, location, category, duration_hours, price_per_person, max_capacity, image_url }).select('*').single()` (status defaults to 'draft' in DB).
- **Update activity:** `from('activities').update({ ... }).eq('id', id).eq('vendor_id', vendor.id).select('*').single()`.
- **Delete activity:** `from('activities').delete().eq('id', id).eq('vendor_id', vendor.id).select('*').single()`.
- **Vendor by owner / create vendor:** `from('vendors').select('*').eq('owner_user_id', uid).maybeSingle()`; insert with `owner_user_id`, `name`.
- **Admin user management:** `from('site_admins').select('user_id')`; insert/delete by `user_id`. `from('vendors').insert/delete` for make_vendor/remove_vendor. `from('profiles')` for admin list (with other data).
- **Profile (account page):** `from('profiles').select(...).eq('id', ...).single()`.
- **Location point (activities):** `supabase.rpc('set_activity_location_point', { p_activity_id, p_lng?, p_lat? })`. Called from `lib/activities/service.ts` on create/update when coordinates are provided or cleared.
- **Location point (accommodations):** `supabase.rpc('set_accommodation_location_point', { p_accommodation_id, p_lng?, p_lat? })`. Called from `lib/accommodations/service.ts` on create/update.
- **List published accommodations (public):** e.g. `from('accommodations').select(...).eq('status','published')` with optional `vendors(name)` join (see `/vacation-planning`).
- **Vendor profile:** `PATCH` via `/api/vendors/me` → `updateVendorProfile` in `lib/vendors/service.ts` (allowed columns only).
- **Storage:** `storage.from('activity-images')` or `storage.from('accommodation-images')` with `upload` / `getPublicUrl`; path pattern `{vendor_id}/{filename}`.

## TODO / Open Questions

- **Profiles delete policy:** No RLS policy for DELETE on profiles in migrations; deletes are denied by default. Add policy if soft-delete or account deletion is required.
- **Column grants and RPCs:** Location RPCs run as the calling user; their UPDATEs are subject to RLS. `location_point` is not in the normal UPDATE grants for `authenticated` on activities or accommodations; the RPC performs the update inside the database. Direct client updates to `location_point` remain blocked for typical authenticated clients.