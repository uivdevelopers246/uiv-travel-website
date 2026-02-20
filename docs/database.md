## Overview

The database is Supabase Postgres in the `public` schema, with PostGIS in `extensions`. It backs a Barbados travel app: **profiles** (1:1 with auth users), **vendors** (one per owner), **site_admins** (admin users), and **activities** (vendor-owned, with optional geolocation). RLS is enabled on all application tables; policies are consolidated in a single migration. Column-level grants on `activities` restrict which columns authenticated users can write. Geocode/location data is updated only via the `set_activity_geocode` RPC.

## Core Tables

### public.profiles

Extends Supabase Auth: one row per `auth.users` row. Holds display name, avatar, bio and audit fields. Created by trigger on signup.

| Item | Detail |
|------|--------|
| **Primary key** | `id` (uuid, FK to `auth.users(id)` ON DELETE CASCADE) |
| **Important columns** | `display_name`, `avatar_url`, `bio`; `created_at`, `updated_at` (not null, default `now()`); `created_by`, `updated_by` (uuid, nullable) |
| **Conventions** | `created_at`/`updated_at` set by trigger `handle_audit_fields_on_profiles` (and table defaults). No status/enum. |

### public.vendors

A vendor account; one per owner. Owner is `auth.users.id`.

| Item | Detail |
|------|--------|
| **Primary key** | `id` (uuid, default `gen_random_uuid()`) |
| **Important columns** | `name` (text not null), `owner_user_id` (uuid not null unique, FK to `auth.users(id)` ON DELETE CASCADE), `created_at`, `updated_at` (timestamptz not null default `now()`) |
| **Conventions** | `updated_at` maintained by trigger `trg_vendors_set_updated_at`. No status/enum. |

### public.site_admins

Marks a user as site admin. Existence of a row implies admin role.

| Item | Detail |
|------|--------|
| **Primary key** | `user_id` (uuid, FK to `auth.users(id)` ON DELETE CASCADE) |
| **Important columns** | `created_at` (timestamptz not null default `now()`) |
| **Conventions** | No updated_at; no status/enum. |

### public.activities

Vendor-owned activity listing (tours, experiences). Can have a text location and optional PostGIS point + geocode metadata.

| Item | Detail |
|------|--------|
| **Primary key** | `id` (uuid, default `gen_random_uuid()`) |
| **Important columns** | `vendor_id` (uuid not null, FK to `vendors(id)` ON DELETE CASCADE), `title` (text not null), `description`, `location` (text), `category` (text not null), `duration_hours` (numeric), `price_per_person` (numeric), `max_capacity` (integer), `rating` (numeric), `image_url`, `is_featured` (boolean not null default false), `status` (text not null default 'draft'), `created_at`, `updated_at` (timestamptz not null default `now()`). Geospatial: `location_point` (geometry(Point, 4326)), `geocode_accuracy` (text), `geocode_label` (text), `geocode_feature_id` (text). |
| **Enums / status** | `category` check: `'water-sports' | 'wildlife' | 'adventure' | 'culture' | 'nature'`. `status` check: `'draft' | 'published' | 'archived'`. `geocode_accuracy` check (if present): `'address' | 'poi' | 'street' | 'neighborhood' | 'locality' | 'place' | 'region' | 'country'`. |
| **Conventions** | `updated_at` set by trigger `trg_activities_set_updated_at`. `rating` and geocode/location_point columns are not in the INSERT/UPDATE grant list for `authenticated` — rating is system-only; location data is set via RPC. |

**TODO:** RPC `set_activity_geocode` writes to a column `geocode_quality`; migrations and types define `geocode_accuracy`. Verify which column exists and align RPC or migrations/types.

## Relationships & Ownership Model

- **profiles** → `id` = `auth.users.id` (1:1).
- **vendors** → `owner_user_id` = `auth.users.id` (many-to-one from auth; app treats one vendor per user).
- **site_admins** → `user_id` = `auth.users.id` (many-to-one; app uses “is admin” by existence of row).
- **activities** → `vendor_id` = `vendors.id` (many activities per vendor).

Ownership for RLS: activity rows are “owned” by the vendor; the vendor is identified by `auth.uid()` = `vendors.owner_user_id`. Admins bypass ownership via `is_site_admin()`.

## RLS Policies Summary

Policies below are the consolidated set (migration `20260129022541`). Column-level grants from `20260119233304` remain: `authenticated` has no broad INSERT/UPDATE on `activities`; only specific columns are granted.

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| **activities** | **anon, authenticated:** published rows OR (authenticated and (vendor owner of row OR site admin)). | **authenticated:** with check vendor owner of `vendor_id` OR site admin. | **authenticated:** using/with check vendor owner of row OR site admin. | **authenticated:** using vendor owner of row OR site admin. |
| **vendors** | **authenticated:** own row (`owner_user_id` = auth.uid()) OR site admin. | **authenticated:** with check owner inserting for self OR site admin. | **authenticated:** using/with check site admin only. | **authenticated:** using site admin only. |
| **site_admins** | **authenticated:** own row (`user_id` = auth.uid()) for “read self”; “table access” policy: using/with check site admin for all. | Same “table access” policy (site admin only). | Same. | Same. |
| **profiles** | **authenticated:** own profile (`id` = auth.uid()); plus policy “Site admins can view all profiles” (authenticated, using is_site_admin()). | **authenticated:** with check own profile (`id` = auth.uid()). | **authenticated:** using/with check own profile. | (No delete policy in migrations; default deny.) |

- **Security definer:** `is_site_admin()`, `is_vendor_user()`, `vendor_id_for_user()` and trigger functions `handle_new_user()`, `handle_audit_fields()` are `security definer` so they run with definer rights (e.g. read `site_admins`/`vendors` for RLS). `is_vendor_owner(v_id)` is not security definer; it runs as invoker and relies on RLS.
- **RPC:** `revoke all ... from public` and `grant execute ... to authenticated` on `set_activity_geocode`. Only authenticated users can call it; RPC does not check activity ownership — it updates by `p_activity_id`. RLS on `activities` still applies to the underlying UPDATE, so the update only succeeds if the caller can update that row (vendor owner or admin).

## Database Functions (RPC + helpers)

### RPC (callable from app)

| Function | Purpose | Args | Optional / defaults | Permissions | Notes |
|----------|---------|------|---------------------|-------------|--------|
| **set_activity_geocode** | Set or clear an activity’s geographic point and geocode metadata. | `p_activity_id` uuid; `p_lng`, `p_lat` double precision; `p_quality`, `p_label`, `p_feature_id` text. | All except `p_activity_id` default to null. | `authenticated` only (execute granted; public revoked). | If `p_lng` or `p_lat` is null, clears `location_point` and geocode fields; otherwise sets point via `st_setsrid(st_makepoint(p_lng, p_lat), 4326)`. Writes to `geocode_quality` in migration (see TODO re `geocode_accuracy`). UPDATE is subject to RLS. |

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
- **Type:** `geometry(Point, 4326)` on `public.activities.location_point` (WGS84).
- **How set:** Only via RPC `set_activity_geocode`. Application code does not insert/update `location_point` (or geocode columns) directly; column grants omit these. Geocode service (Mapbox) runs in app; app passes lng/lat/quality/label/feature_id to the RPC.
- **Clearing:** RPC clears `location_point` and geocode-related columns when `p_lng` or `p_lat` is null.
- **Index:** GIST index `idx_activities_location_point` on `activities(location_point)` for spatial queries.
- **“Near” queries:** No app code found that runs distance/near queries yet. Expected pattern: use PostGIS (e.g. `ST_DWithin`, `ST_Distance`) on `location_point` with a radius; index supports such queries.

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
10. `20260219012002_create_activity_geocode_rpc.sql` — Defines set_activity_geocode (writes location_point, geocode_quality, geocode_label, geocode_feature_id); revoke/grant execute.

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
- **Geocode persistence:** `supabase.rpc('set_activity_geocode', { p_activity_id, p_lng, p_lat, p_quality, p_label, p_feature_id })` (or nulls to clear). Used only from `lib/activities/service.ts` in `upsertActivityGeocode` (not yet called from create/update API flows).
- **Storage:** `storage.from('activity-images').upload(path, file)` and `getPublicUrl(path)`; path pattern `{vendor_id}/{filename}`.

## TODO / Open Questions

- **geocode_quality vs geocode_accuracy:** Migration `20260216123729` adds column `geocode_accuracy`; RPC `set_activity_geocode` in `20260219012002` sets `geocode_quality`. Types in `supabase/types/database.ts` have `geocode_accuracy`. Either add/rename a column to `geocode_quality` and align types, or change the RPC to use `geocode_accuracy` and regenerate types.
- **Profiles delete policy:** No RLS policy for DELETE on profiles in migrations; deletes are denied by default. Add policy if soft-delete or account deletion is required.
- **Column grants and RPC:** RPC runs as the authenticated user; the UPDATE it performs is subject to RLS. Column-level grants may still block updating columns not in the UPDATE grant list; confirm that the RPC’s UPDATE is allowed (e.g. service role or explicit grant for the RPC context if needed). Current migration grants UPDATE only on (title, description, location, category, duration_hours, price_per_person, max_capacity, image_url, status) for `authenticated`; `location_point`, `geocode_quality`/`geocode_accuracy`, `geocode_label`, `geocode_feature_id` are not in that list, so direct client updates to those columns are already blocked; the RPC runs in the same role — TODO: verify RPC can update those columns or whether a separate grant or definer is needed.