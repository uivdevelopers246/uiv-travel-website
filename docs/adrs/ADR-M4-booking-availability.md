# ADR-M4: Booking & Availability Module

**Status:** Accepted  
**Milestone:** M4 — Booking & Availability  
**Date:** 2026-03-28  
**Deciders:** UIV Travel development team  

---

## Context

UIV Travel requires a booking system that allows public users to reserve spots on vendor-listed activities. The system must support:

- Multiple users booking into the same time slot (e.g. a catamaran cruise with 20 spots)
- Vendor-managed availability windows derived from activity duration
- Overbooking prevention under concurrent booking attempts
- A payment flow where bookings are held pending Stripe confirmation
- A 5% discount for first-time customers
- Commission retention (10% to platform, 90% to operator) managed externally via bank accounts for MVP

The payment document specifies two flows: a **Full Payment (MVP)** option where users pay 100% upfront via Stripe, and a **Deposit option (post-MVP)** where users pay 25% upfront and the remaining 75% is auto-charged two weeks before the activity date.

---

## Decision

Implement a native slot-based availability system using two new tables: `availability_slots` and `activity_bookings`. The table is named `activity_bookings` (not `bookings`) to make clear that accommodation bookings — a distinct booking model planned for M4 Phase 2 — will live in a separate `accommodation_bookings` table rather than sharing this one.

Capacity enforcement uses **Option B: computed capacity** — `booked_count` is derived at query time from the `activity_bookings` table rather than maintained as a stored column on the slot.

Overbooking is prevented via a `FOR UPDATE` row lock on the slot inside a dedicated RPC (`reserve_slot_capacity`), combined with a `CHECK` constraint on the `activity_bookings` table.

The deposit payment option is explicitly out of scope for MVP and deferred to a post-launch milestone.

---

## System Design

### Tables

#### `availability_slots`

Vendor-created time windows for a specific activity. Each slot has a fixed start time, an end time derived from `activity.duration_hours`, and a maximum capacity.

```sql
create table public.availability_slots (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references public.activities(id) on delete cascade,
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,  -- computed server-side: starts_at + duration_hours
  max_capacity  integer not null check (max_capacity > 0),
  is_cancelled  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint ends_after_starts check (ends_at > starts_at)
);

create index idx_slots_activity_starts
  on availability_slots(activity_id, starts_at)
  where is_cancelled = false;
```

`vendor_id` is denormalized from the activity for simpler RLS policies and vendor dashboard queries.  
`ends_at` is stored (not computed at query time) to make availability display and overlap queries straightforward.  
`booked_count` is intentionally absent — this is the core of the Option B decision (see Alternatives Considered).

#### `activity_bookings`

A single confirmed or in-progress reservation by a user for a specific activity slot. Named `activity_bookings` to distinguish it from the future `accommodation_bookings` table, which will use a different availability model (date-range based rather than slot-based).

```sql
create table public.activity_bookings (
  id                        uuid primary key default gen_random_uuid(),
  slot_id                   uuid not null references public.availability_slots(id) on delete restrict,
  activity_id               uuid not null references public.activities(id) on delete restrict,
  user_id                   uuid not null references auth.users(id) on delete restrict,
  vendor_id                 uuid not null references public.vendors(id) on delete restrict,

  status                    text not null default 'pending_payment'
                            check (status in (
                              'pending_payment',
                              'confirmed',
                              'cancelled',
                              'completed'
                            )),

  participants              integer not null check (participants >= 1),

  -- Price snapshot at time of booking (never re-read from activity)
  unit_price_cents          integer not null,
  subtotal_cents            integer not null,
  discount_cents            integer not null default 0,
  total_cents               integer not null,

  -- Stripe references
  stripe_payment_intent_id  text unique,
  stripe_session_id         text unique,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_activity_bookings_slot_status
  on activity_bookings(slot_id, status)
  where status in ('pending_payment', 'confirmed');

create index idx_activity_bookings_user_id on activity_bookings(user_id);
create index idx_activity_bookings_vendor_id on activity_bookings(vendor_id);
```

`activity_id` and `vendor_id` are denormalized from the slot for query simplicity and RLS.  
Prices are snapshotted at booking creation time. The vendor can change their activity price without affecting existing bookings.

### Status Machine

```
pending_payment → confirmed   (Stripe webhook: payment_intent.succeeded)
pending_payment → cancelled   (user cancels before payment, or payment fails)
confirmed       → cancelled   (user or vendor cancels; admin handles if booked_count > 0)
confirmed       → completed   (admin marks after activity executes; triggers payout eligibility)
```

Status transitions happen only in the service layer. No direct client writes to `status`.

### Capacity Enforcement RPC

```sql
-- p_ prefix = parameter (passed by caller)
-- v_ prefix = variable (declared locally)
create or replace function reserve_slot_capacity(
  p_slot_id      uuid,
  p_participants integer
) returns void language plpgsql as $$
declare
  v_current_booked  integer;
  v_max_capacity    integer;
begin
  -- FOR UPDATE locks the slot row, serialising concurrent booking attempts
  select
    coalesce((
      select sum(b.participants)
      from activity_bookings b
      where b.slot_id = p_slot_id
        and b.status in ('pending_payment', 'confirmed')
    ), 0),
    s.max_capacity
  into v_current_booked, v_max_capacity
  from availability_slots s
  where s.id = p_slot_id
    and s.is_cancelled = false
  for update;

  if not found then
    raise exception 'Slot not found or is cancelled';
  end if;

  if v_current_booked + p_participants > v_max_capacity then
    raise exception 'Not enough capacity on this slot';
  end if;
end;
$$;

grant execute on function reserve_slot_capacity(uuid, integer) to authenticated;
revoke execute on function reserve_slot_capacity(uuid, integer) from public;
```

`v_current_booked` reads the live sum of participants across all active bookings on the slot at the moment the function runs. The `FOR UPDATE` lock on the slot row prevents a second concurrent call from reading the same value simultaneously, eliminating the race condition that causes overbooking. The capacity check is a guard only — no write to `booked_count` occurs because the column does not exist.

### First-Time Customer Discount

In `createBooking`, before inserting, the service checks whether `auth.uid()` has any prior booking in `activity_bookings` with `status IN ('confirmed', 'completed')`. If none exist, `discount_cents = round(subtotal_cents * 0.05)` is applied and stored on the booking row. This is computed once at booking creation and never recalculated.

### Slot Cancellation Rule (MVP)

Cancelling a slot where `booked_count > 0` (computed) is blocked at the API layer for MVP. Vendors must contact the admin to handle the edge case manually. This avoids building a cancellation notification and refund flow in M4.

---

## RLS Policies

### `availability_slots`

```sql
-- Public can view open slots for published activities
create policy "public_view_slots" on availability_slots
  for select using (is_cancelled = false);

-- Vendors manage their own slots
create policy "vendors_manage_own_slots" on availability_slots
  for all to authenticated
  using (vendor_id = (select id from vendors where owner_user_id = auth.uid()))
  with check (vendor_id = (select id from vendors where owner_user_id = auth.uid()));

-- Admins manage all
create policy "admins_all_slots" on availability_slots
  for all to authenticated
  using (is_site_admin())
  with check (is_site_admin());
```

### `activity_bookings`

```sql
-- Users see their own bookings
create policy "users_select_own" on activity_bookings
  for select to authenticated using (user_id = auth.uid());

-- Users can insert (service enforces user_id = auth.uid())
create policy "users_insert" on activity_bookings
  for insert to authenticated with check (user_id = auth.uid());

-- Vendors see bookings on their activities
create policy "vendors_select_own_activity_bookings" on activity_bookings
  for select to authenticated
  using (vendor_id = (select id from vendors where owner_user_id = auth.uid()));

-- Admins manage all
create policy "admins_all_bookings" on activity_bookings
  for all to authenticated
  using (is_site_admin()) with check (is_site_admin());
```

Status transitions have no update policy for `authenticated`. All updates go through the service layer using a server-side Supabase client (which respects RLS) or the admin route.

---

## API Routes

### Availability Slots

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/activities/[id]/slots` | Public | List upcoming, open slots for a published activity. Returns only slots where `starts_at > now()` and computed remaining capacity > 0. |
| `POST` | `/api/activities/[id]/slots` | Vendor | Create a slot. Body: `{ starts_at, max_capacity }`. `ends_at` computed server-side from `activity.duration_hours`. |
| `GET` | `/api/activities/[id]/slots/manage` | Vendor | Full slot list for the vendor's own activity — all statuses, all dates. Used in the vendor management UI. |
| `PATCH` | `/api/activities/[id]/slots/[slotId]` | Vendor | Update a slot. Blocked if any active bookings exist on the slot. |
| `DELETE` | `/api/activities/[id]/slots/[slotId]` | Vendor | Cancel a slot (`is_cancelled = true`). Blocked if computed `booked_count > 0`. Hard deletes are never used. |

### Activity Bookings

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/activity-bookings` | User | Create a booking. Body: `{ slotId, participants }`. Calls `reserve_slot_capacity` RPC, snapshots price, applies new-customer discount, inserts as `pending_payment`. Returns booking ID for Stripe handoff. |
| `GET` | `/api/activity-bookings` | User | List the authenticated user's activity bookings. Joins slot and activity for display. |
| `GET` | `/api/activity-bookings/[id]` | User / Vendor | Single booking detail. Accessible by the booking owner or the relevant vendor. Used for confirmation screen. |
| `POST` | `/api/activity-bookings/[id]/cancel` | User | Cancel a booking. Validates cancellable state. Status → `cancelled`. |

### Stripe Webhook

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/webhooks/stripe` | None (signature verified) | Stripe webhook receiver. Verifies `stripe-signature` header. On `payment_intent.succeeded`, calls `confirmBooking` → status transitions to `confirmed`, triggers Resend email to vendor. Only path that moves a booking to `confirmed`. |

### Vendor Dashboard

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/vendor/activity-bookings` | Vendor | All activity bookings across the vendor's activities. Supports filtering by `status` and date range. RLS scopes automatically. |
| `GET` | `/api/vendor/activity-bookings/[id]` | Vendor | Single booking detail from the vendor's perspective — customer info, slot, participants, payment status. |

### Admin

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/admin/activity-bookings` | Admin | All activity bookings across all vendors. For support and dispute resolution. |
| `PATCH` | `/api/admin/activity-bookings/[id]` | Admin | Manual status transition. Primary use: moving a booking to `completed` after the activity executes, which flags it as payout-eligible. |

---

## Files to Add

### Migrations

```
supabase/migrations/
  YYYYMMDD_create_availability_slots.sql
  YYYYMMDD_create_activity_bookings.sql
  YYYYMMDD_rls_availability_slots.sql
  YYYYMMDD_rls_activity_bookings.sql
  YYYYMMDD_reserve_slot_capacity_rpc.sql
```

One migration per concern for clean rollback.

### Service Layer

```
src/lib/activity-bookings/
  service.ts         — createBooking, confirmBooking, cancelBooking, listUserBookings, getBooking
  types.ts           — ActivityBookingDisplay, ActivityBookingStatus, CreateActivityBookingInput
  constants.ts       — ACTIVITY_BOOKING_STATUS enum, PLATFORM_COMMISSION_RATE, NEW_CUSTOMER_DISCOUNT_RATE

src/lib/slots/
  service.ts         — createSlot, listPublicSlots, listVendorSlots, updateSlot, cancelSlot
  types.ts           — SlotDisplay, CreateSlotInput
```

### API Routes

```
src/app/api/
  activities/[id]/slots/
    route.ts                              — GET (public), POST (vendor)
    manage/route.ts                       — GET (vendor manage view)
    [slotId]/route.ts                     — PATCH, DELETE (vendor)

  activity-bookings/
    route.ts                              — GET (user list), POST (create)
    [id]/
      route.ts                            — GET (detail)
      cancel/route.ts                     — POST (cancel)

  vendor/activity-bookings/
    route.ts                              — GET (vendor booking list)
    [id]/route.ts                         — GET (vendor booking detail)

  admin/activity-bookings/
    route.ts                              — GET (admin list)
    [id]/route.ts                         — PATCH (admin status transition)

  webhooks/
    stripe/route.ts                       — POST (Stripe webhook, signature verified)
```

### Environment Variables to Add

```
STRIPE_SECRET_KEY          — server-only, never NEXT_PUBLIC_
STRIPE_WEBHOOK_SECRET      — server-only, never NEXT_PUBLIC_
```

Document both in `docs/architecture.md` under the environment variables table.

---

## Alternatives Considered

### Option A — Stored `booked_count` Column

Maintains a `booked_count` integer directly on `availability_slots`, incremented on booking creation and decremented on cancellation. Reads are fast (single column lookup). Rejected for MVP because:

- Requires two writes to stay consistent (booking insert + slot update), creating drift risk if one fails or a code path forgets to decrement
- Cancellation logic must always remember to release capacity — a bug here silently undersells slots
- At MVP volumes the query performance difference is undetectable

Recommended migration path to Option A if scale demands it: add `booked_count` as a backfilled column, then add a Postgres trigger (`AFTER INSERT OR UPDATE OR DELETE ON activity_bookings`) that recalculates and syncs the value automatically. The trigger makes drift impossible by removing application code from the update path entirely. The RPC then reads `booked_count` directly for fast lookups. This migration is non-breaking and can be applied without touching the booking service.

### Option B — Computed Capacity (Selected)

Capacity is always derived fresh from the `activity_bookings` table. No stored count. The `reserve_slot_capacity` RPC uses `FOR UPDATE` on the slot row to serialize concurrent attempts, and queries the sum of active participants inline. Selected because:

- Single source of truth — the `activity_bookings` table is never out of sync with itself
- Simpler cancellation — no counter to decrement
- Drift is structurally impossible
- Query cost is negligible at MVP scale with the `idx_bookings_slot_status` partial index

### Option C — Recurring Slot Rules (Deferred)

A `slot_rules` table defines a schedule (e.g. "every Saturday at 9am and 2pm") and generates `availability_slots` rows either eagerly (via a background job) or lazily. Deferred because:

- Adds meaningful schema and generation logic complexity for M4
- The `availability_slots` table is designed to be populated by either manual creation or a rule generator — the booking logic is agnostic to how slot rows were created
- Can be added in a later milestone without any changes to `activity_bookings` or the booking service

### Option D — Calendly Integration

Rejected. Calendly is designed for one-on-one scheduling and has no native concept of group capacity across multiple bookings to the same event. Enforcing `max_capacity` would require reconciling UIV booking records against Calendly state, which is fragile. Also introduces a hard external dependency on a core transactional flow.

### Option E — External Booking Engine (Fareharbor, Bokun, Rezdy)

Rejected for MVP. Would surrender control of the payment and commission relationship, introduce per-booking fees on top of the platform commission, and require significant integration effort. Worth revisiting if vendor onboarding data shows the majority of operators are already on one of these platforms.

---

## Consequences

**Positive**
- Overbooking is prevented at the database level, not just in application code
- Capacity computation is always accurate with no synchronization required
- The slot table design is compatible with future recurring rule generation (Option C) without migration changes
- Price snapshotting on the booking row means financial records are immutable after creation

**Negative / Accepted tradeoffs**
- Capacity queries join `bookings` on every request; acceptable at MVP scale, addressable with the Option A migration path if needed
- Vendors must create slots manually for MVP; the recurring rule engine (Option C) is the long-term solution
- Slot cancellation with active bookings requires admin intervention; refund and notification automation is deferred

**Out of scope for M4 Phase 1 (this ADR)**
- Deposit payment option (25% upfront, 75% auto-charged two weeks before activity)
- Automated payout remittance to operators (manual banking process for MVP)
- Recurring slot rule generation
- Cancellation notification emails (covered in M6 — Notifications)
- **Accommodation bookings** (M4 Phase 2 — see note below)

---

## M4 Phase 2 — Accommodation Bookings (Planned, Not Designed Here)

Accommodation bookings are a distinct booking model and are explicitly out of scope for this ADR. They will be designed and implemented as a follow-on phase once activity bookings are stable.

**Why a separate table and ADR:** Accommodation bookings are date-range based — a guest selects a check-in date and a check-out date, and the resource being reserved is the property itself. This is fundamentally different from the slot-based, headcount model used for activities. Forcing accommodation bookings into `activity_bookings` would require nullable columns for incompatible fields and make the availability enforcement logic ambiguous. A separate `accommodation_bookings` table keeps both models clean and independently evolvable.

**What the M4 Phase 2 ADR will need to address:**
- Availability represented as open date ranges on a property, not discrete slots
- Overbooking prevention via overlapping date-range detection (`tsrange` or explicit `check_in` / `check_out` exclusion constraints in Postgres) rather than headcount against a slot
- Whether nightly pricing is flat (`price_min_usd` from the accommodation row) or varies by date (requires a separate rate table — likely post-MVP)
- Check-in / check-out time enforcement from the `accommodations` schema (`check_in_time`, `check_out_time` columns already exist)
- The new-customer discount logic will need to check both `activity_bookings` and `accommodation_bookings` for prior confirmed bookings
