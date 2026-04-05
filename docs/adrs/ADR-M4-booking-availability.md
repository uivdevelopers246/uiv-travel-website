# ADR-M4-A: Booking & Availability Module

**Status:** Accepted  
**Milestone:** M4 — Booking & Availability  
**Date:** 2026-03-28 (updated 2026-04-03)  
**Deciders:** UIV Travel development team  

**Related ADRs**

- **[ADR-M4-B: Shopping Cart & Checkout](./ADR-M4-shopping-cart-and-checkout.md)** — authenticated cart, `orders`, Stripe Checkout Session, **creation of `activity_bookings` after payment** (webhook), order-level Stripe IDs, merge rules, refund-on-full-failure.

---

## Context

UIV Travel requires a booking system that allows public users to reserve spots on vendor-listed activities. The system must support:

- Multiple users booking into the same time slot (e.g. a catamaran cruise with 20 spots)
- Vendor-managed availability windows derived from activity duration
- Overbooking prevention under concurrent booking attempts
- **Checkout and payment at the order level** (Stripe Checkout Session for one or more cart lines); **`activity_bookings` rows are created only after successful payment** via webhook — see ADR-M4-B
- Commission retention (10% to platform, 90% to operator) managed externally via bank accounts for MVP

The payment document specifies two flows: a **Full Payment (MVP)** option where users pay **100% upfront** via Stripe, and a **Deposit option (post-MVP)** where users pay 25% upfront and the remaining 75% is auto-charged two weeks before the activity date.

---

## Decision

Implement a native slot-based availability system using two new tables: `availability_slots` and `activity_bookings`. The table is named `activity_bookings` (not `bookings`) to make clear that accommodation bookings — a distinct booking model planned for M4 Phase 2 — will live in a separate `accommodation_bookings` table rather than sharing this one.

Capacity enforcement uses **Option B: computed capacity** — `booked_count` is derived at query time from the `activity_bookings` table rather than maintained as a stored column on the slot.

Overbooking is prevented via a `FOR UPDATE` row lock on the slot inside **`create_activity_booking_after_payment`**, which performs capacity check and **`INSERT` in one transaction**, plus `CHECK` constraints on `activity_bookings`.

The deposit payment option is explicitly out of scope for MVP and deferred to a post-launch milestone.

**Cart vs capacity:** Items in the **shopping cart do not reserve capacity** (ADR-M4-B). Only rows in `activity_bookings` with qualifying statuses count toward slot capacity — in MVP, effectively **`confirmed`** bookings created after payment.

**DB rule for booking creation:** RLS grants **no `INSERT` policy to `authenticated`** on `activity_bookings`. New rows are inserted only by the **Stripe webhook** (or other server paths) using the **service role** client, which bypasses RLS, and by **site admins** via the admin `FOR ALL` policy when acting with an admin JWT. This matches “paid checkout only” at the database boundary; ordinary users cannot mint bookings without going through payment fulfillment.

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

  -- Checkout aggregate; set when booking is created from a paid order (ADR-M4-B)
  order_id                  uuid references public.orders(id) on delete restrict,

  status                    text not null default 'confirmed'
                            check (status in (
                              'confirmed',
                              'cancelled',
                              'completed'
                            )),

  participants              integer not null check (participants >= 1),

  -- Immutable snapshot at row creation (never re-read from activity); see ADR-M4-B for cart snapshot vs ledger
  unit_price_cents          integer not null,
  subtotal_cents            integer not null,
  discount_cents            integer not null default 0,  -- MVP: always 0; reserved for future promotions/coupons
  total_cents               integer not null,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_activity_bookings_slot_status
  on activity_bookings(slot_id, status)
  where status = 'confirmed';

create index idx_activity_bookings_order_id on activity_bookings(order_id);

create index idx_activity_bookings_user_id on activity_bookings(user_id);
create index idx_activity_bookings_vendor_id on activity_bookings(vendor_id);
```

`activity_id` and `vendor_id` are denormalized from the slot for query simplicity and RLS.  
`order_id` links the booking to the paid checkout (ADR-M4-B). **Stripe identifiers live on `orders`**, not on each booking row for MVP.

Prices are snapshotted at **booking row creation** (webhook time). The vendor can change their activity price without affecting existing bookings. **Cart lines** also store a snapshot at add-to-cart (ADR-M4-B).

### Status Machine

MVP inserts bookings as **`confirmed`** immediately after successful payment (single transactional path from webhook). There is no long-lived `pending_payment` row for the happy path.

```
confirmed       → cancelled   (user or vendor cancels; admin handles edge cases)
confirmed       → completed   (admin marks after activity executes; triggers payout eligibility)
```

Status transitions happen only in the service layer. No direct client writes to `status`.

### Capacity enforcement RPC (`create_activity_booking_after_payment`)

Canonical SQL lives in `supabase/migrations/20260403120300_reserve_slot_capacity_rpc.sql`. **`create_activity_booking_after_payment`** is `SECURITY DEFINER`, returns the inserted `activity_bookings` row, and **`grant execute` is limited to `service_role`** (it inserts rows; it must not be callable by ordinary `authenticated` clients).

In one transaction it: locks the slot (`FOR UPDATE`), computes the sum of **`confirmed`** participants for that slot, verifies `p_activity_id` / `p_vendor_id` match the slot (defense in depth), rejects if over capacity or slot missing/cancelled, then **`INSERT`s** the booking. That removes the race between a separate “check capacity” RPC and a later `INSERT` that could each commit independently.

`v_current_booked` reads the live sum at the moment the function runs, while the slot row stays locked until the insert commits — concurrent payers serialize on the same slot. No `booked_count` column exists (Option B).

### Promotional discounts (MVP)

**No discount or coupon logic in MVP** — `discount_cents` on `activity_bookings` (and order/cart line discount fields in ADR-M4-B) remains **0**. The columns are retained so future promotions do not require a breaking schema change.

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

-- No INSERT policy for authenticated. Inserts are performed by:
--   - Stripe webhook (service role; bypasses RLS) after successful payment — see ADR-M4-B
--   - Site admins via the policy below (FOR ALL includes INSERT)
-- Cart and checkout APIs must not insert into activity_bookings as the end user.

-- Vendors see bookings on their activities
create policy "vendors_select_own_activity_bookings" on activity_bookings
  for select to authenticated
  using (vendor_id = (select id from vendors where owner_user_id = auth.uid()));

-- Admins manage all
create policy "admins_all_bookings" on activity_bookings
  for all to authenticated
  using (is_site_admin()) with check (is_site_admin());
```

**User cancel:** Authenticated users do not get a broad `UPDATE` policy. They cancel via the **`cancel_activity_booking`** `SECURITY DEFINER` RPC (sets `status` to `cancelled` for their own `confirmed` row only). Other status transitions use the service layer with a server-side client (e.g. admin JWT with `FOR ALL`) or privileged paths as documented in ADR-M4-B.

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
| `GET` | `/api/activity-bookings` | User | List the authenticated user's activity bookings. Joins slot, activity, optional `order` for display. |
| `GET` | `/api/activity-bookings/[id]` | User / Vendor | Single booking detail. Accessible by the booking owner or the relevant vendor. Used for confirmation screen. |
| `POST` | `/api/activity-bookings/[id]/cancel` | User | Cancel a booking. Validates cancellable state. Status → `cancelled`. |

**Creation path:** New bookings are **not** created via a public `POST /api/activity-bookings` in the MVP flow. They are created from the **Stripe webhook** after payment (ADR-M4-B), optionally preceded by a **“Book now”** UX that adds a line to the cart or starts checkout. **RLS enforces this:** `authenticated` has **no** `INSERT` on `activity_bookings`; the webhook uses the **service role**. **Admin/support** creation (if ever needed) uses a site-admin session (`FOR ALL` policy) or the same privileged server client — not the anon/publishable user role.

### Stripe Webhook

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/webhooks/stripe` | None (signature verified) | See **ADR-M4-B**. Verifies `stripe-signature`. On successful Checkout Session / PaymentIntent completion, **idempotently** creates `activity_bookings` via **`create_activity_booking_after_payment`** per line (atomic capacity + insert). On fulfillment failure after charge: **refund full order** (MVP policy). |

### Shopping cart & checkout

Cart, `orders`, and Checkout Session creation are defined in **[ADR-M4-B](./ADR-M4-shopping-cart-and-checkout.md)** (`/api/cart`, `/api/checkout`, etc.).

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
  YYYYMMDD_create_orders.sql              -- ADR-M4-B: may precede activity_bookings if FK from bookings → orders
  YYYYMMDD_create_cart_lines.sql          -- ADR-M4-B
  YYYYMMDD_create_availability_slots.sql
  YYYYMMDD_create_activity_bookings.sql   -- includes order_id FK to orders
  YYYYMMDD_rls_availability_slots.sql
  YYYYMMDD_rls_activity_bookings.sql
  YYYYMMDD_rls_orders.sql
  YYYYMMDD_rls_cart_lines.sql
  YYYYMMDD_reserve_slot_capacity_rpc.sql   -- `create_activity_booking_after_payment` (atomic booking RPC)
```

Order migrations before `activity_bookings` if the booking table references `orders`. One migration per concern for clean rollback.

### Service Layer

```
src/lib/activity-bookings/
  service.ts         — createBookingsFromPaidOrder (webhook), cancelBooking, listUserBookings, getBooking
  types.ts           — ActivityBookingDisplay, ActivityBookingStatus
  constants.ts       — ACTIVITY_BOOKING_STATUS enum, PLATFORM_COMMISSION_RATE

src/lib/slots/
  service.ts         — createSlot, listPublicSlots, listVendorSlots, updateSlot, cancelSlot
  types.ts           — SlotDisplay, CreateSlotInput

src/lib/cart/        — ADR-M4-B
src/lib/orders/      — ADR-M4-B
```

### API Routes

```
src/app/api/
  activities/[id]/slots/
    route.ts                              — GET (public), POST (vendor)
    manage/route.ts                       — GET (vendor manage view)
    [slotId]/route.ts                     — PATCH, DELETE (vendor)

  cart/                                   — ADR-M4-B (lines CRUD)
  checkout/route.ts                       — ADR-M4-B

  activity-bookings/
    route.ts                              — GET (user list)
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
    stripe/route.ts                       — POST (ADR-M4-B: payment + create bookings)
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

Capacity is always derived fresh from the `activity_bookings` table. No stored count. **`create_activity_booking_after_payment`** uses `FOR UPDATE` on the slot row and keeps the lock until the booking insert commits, serializing concurrent attempts on that slot. Selected because:

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
- Order-level Stripe integration (ADR-M4-B) supports multi-item checkout without per-booking payment IDs

**Negative / Accepted tradeoffs**
- Capacity queries join `bookings` on every request; acceptable at MVP scale, addressable with the Option A migration path if needed
- Vendors must create slots manually for MVP; the recurring rule engine (Option C) is the long-term solution
- Slot cancellation with active bookings requires admin intervention; refund and notification automation is deferred
- Cart does not hold inventory (ADR-M4-B): users may lose a slot between add-to-cart and payment; MVP mitigates with fail-whole-order + refund

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
