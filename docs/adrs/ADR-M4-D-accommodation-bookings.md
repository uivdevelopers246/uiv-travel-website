# ADR-M4-D: Accommodation Bookings (M4 Phase 2)

**Status:** Accepted  
**Milestone:** M4 Phase 2 — Accommodation checkout & bookings  
**Date:** 2026-07-22  
**Deciders:** UIV Travel development team  

**Related ADRs**

- **[ADR-M4-A: Booking & Availability](./ADR-M4-A-booking-availability.md)** — activity slots / `activity_bookings`; Phase 2 stays are **out of scope** there and designed **here**.
- **[ADR-M4-B: Shopping Cart & Checkout](./ADR-M4-B-shopping-cart-and-checkout.md)** — `cart_lines` / `orders` shape; accommodation columns already exist on `cart_lines`.
- **[ADR-M4-C: Pending-approval checkout & payment on confirmation](./ADR-M4-C-pending-approval-checkout-and-payment.md)** — **SetupIntent → pending approval → one settlement charge**; this ADR extends that flow to stays and **mixed** carts.

---



## Context

Listings CRUD and browse for **accommodations** are live. Public detail is still contact-only. The cart schema already allows `line_type = 'accommodation'` with `accommodation_id`, `check_in`, `check_out`, and `guests` (`[cart_lines](../../supabase/migrations/20260403120700_create_cart_lines.sql)`), but app commerce only implements **activity** lines: cart validation, SetupIntent fulfillment, vendor approval, and settlement all assume `activity_bookings`.

ADR-M4-A deferred accommodation design because stays are **date-range** reservations of a whole property, not **slot + headcount** capacity. Extending `activity_bookings` or `availability_slots` would force nullable incompatible fields and ambiguous inventory rules.

Stakeholders want stays to participate in the **same M4-C money path** already proven for activities: save card → vendor approval within SLA → **one** order-level settlement `PaymentIntent` for confirmed lines only. Mixed activity + stay carts must be allowed.

---



## Decision

1. **Separate ledger table:** `accommodation_bookings` — never reuse `activity_bookings` or `availability_slots` for stays.
2. **Availability model (MVP):** **Open calendar** for published listings. Any future stay with `check_out > check_in` is eligible at cart/checkout time **unless** it overlaps an inventory-holding booking (below). **No** rate calendar and **no** blocked-range table in Phase 2 MVP; vendors decline off-platform conflicts. Optional `accommodation_blocked_ranges` (or similar) is **post-MVP**.
3. **Overlap exclusion:** Non-cancelled inventory holds use a half-open date range `[check_in, check_out)` stored as `daterange` (or equivalent). Postgres **exclusion constraint** (GiST) prevents two overlapping holds for the same `accommodation_id` when status is inventory-holding. Holding statuses: `pending_approval` (within SLA) and `confirmed`. `declined`, `expired`, `cancelled`, and `completed` do **not** hold the calendar.
4. **Flat nightly pricing:** `nights = check_out::date - check_in::date` (must be ≥ 1). Nightly rate = listing `price_min_usd` converted to integer cents at snapshot time. Line / booking totals: `nights × unit_price_cents` (MVP: `discount_cents = 0`). No seasonal rates in Phase 2. Listings without a usable `price_min_usd` are not addable to cart.
5. **Guests:** Require `guests >= 1`. When `accommodations.max_guest_capacity` is **set**, reject `guests > max_guest_capacity`. When it is **null**, treat capacity as **honor system** (allow any `guests >= 1`; vendor may still decline). Do not invent a second capacity column.
6. **M4-C parity:** Same commerce flow as activities — cart does **not** reserve; hold starts only when a `pending_approval` booking row is created after SetupIntent success; 24-hour SLA (`expires_at`); vendor/admin approve or decline per line; shared order settlement.
7. **Statuses:** Align with activity bookings: `pending_approval` → `confirmed` | `declined` | `expired`; `confirmed` → `cancelled` | `completed`. Same SLA constant and expiry-job pattern as activities.
8. **Settlement aggregation:** When deciding “all lines terminal” and “confirmed total,” include **both** `activity_bookings` and `accommodation_bookings` for the order. Settlement amount = sum of `total_cents` where `status = 'confirmed'` across **both** tables. Empty confirmed set → no charge (order declined/expired path as today).
9. **Cart CHECKs:** When `line_type = 'accommodation'`, require `accommodation_id`, `check_in`, `check_out`, `guests`; activity-only columns null (and vice versa). Partial unique merge key for stays: `(user_id, accommodation_id, check_in, check_out)` (or replace-same-listing rule documented in implementation).
10. **RLS / inserts:** Mirror activities — **no** `authenticated` `INSERT` on `accommodation_bookings`; create via **service-role** / `SECURITY DEFINER` RPC after setup fulfillment; vendor/admin update for approve/decline; buyer cancel via narrow RPC for own `confirmed` rows.

---



## System design



### Availability (MVP)

```
Published listing
  → open calendar (any check_in / check_out with check_out > check_in, check_in not in the past)
  → soft check at cart/checkout (warn / 400 if overlap with holding bookings)
  → hard hold only at create_accommodation_booking_after_setup (exclusion + insert)
```

**Cart does not reserve** (same as ADR-M4-B/C for activities). Two users may add the same dates; the second create-RPC fails on overlap; fulfillment compensates partial success (cancel both booking kinds for the order, do not clear cart until all line kinds succeed).

**Display:** Optional “unavailable” shading can query overlapping `pending_approval` / `confirmed` ranges; not required to ship cart add.

**Check-in / check-out times:** Listing `check_in_time` / `check_out_time` are **informational** for MVP (shown in UI / confirmation). Inventory math is **date-based** only (`date` / `daterange`), not wall-clock.

### Overlap rule

Treat stays as half-open ranges so back-to-back bookings do not conflict:

- Guest A: Fri → Sun → occupies Fri night and Sat night; Sunday is free for the next check-in.
- Guest B: Sun → Tue → allowed.

Enforce with something equivalent to:

```sql
-- Conceptual; canonical SQL lives in migrations.
stay_range daterange generated always as (daterange(check_in, check_out, '[)')) stored,

exclude using gist (
  accommodation_id with =,
  stay_range with &&
) where (status in ('pending_approval', 'confirmed'));
```

(Exact syntax may use `btree_gist` + partial exclusion, or a `SECURITY DEFINER` lock + overlap `SELECT` inside the create RPC if exclusion tooling is constrained — **invariant** is the same: no two holding rows overlap for one listing.)

### Pricing snapshot


| Field                                    | Source at add-to-cart / booking create              |
| ---------------------------------------- | --------------------------------------------------- |
| `unit_price_cents`                       | `round(price_min_usd * 100)` from published listing |
| `nights`                                 | `check_out - check_in` (integer days)               |
| `subtotal_cents` / `line_subtotal_cents` | `nights * unit_price_cents`                         |
| `discount_cents`                         | `0` (MVP)                                           |
| `total_cents` / `line_total_cents`       | subtotal − discount                                 |


Re-price / re-validate at checkout from **current** listing price (same pattern as activity cart). Immutable money fields on `accommodation_bookings` are taken from **cart line snapshots** at SetupIntent fulfillment (not re-read from listing at approve time).

### `accommodation_bookings` (target shape)


| Column                                                                | Purpose                                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `id`                                                                  | UUID PK                                                                               |
| `order_id`                                                            | FK → `orders` (required for M4-C path)                                                |
| `accommodation_id`                                                    | FK → `accommodations`                                                                 |
| `user_id`                                                             | Buyer                                                                                 |
| `vendor_id`                                                           | Denormalized from listing (RLS / vendor lists)                                        |
| `check_in`, `check_out`                                               | `date`; `check_out > check_in`                                                        |
| `guests`                                                              | Integer ≥ 1                                                                           |
| `status`                                                              | `pending_approval` | `confirmed` | `declined` | `expired` | `cancelled` | `completed` |
| `expires_at`                                                          | SLA deadline when `pending_approval`                                                  |
| `unit_price_cents`, `subtotal_cents`, `discount_cents`, `total_cents` | Ledger snapshots                                                                      |
| `created_at`, `updated_at`                                            | Audit                                                                                 |


**Stripe IDs** remain on `orders` only (ADR-M4-C). No per-stay PaymentIntent in MVP.

### Status machine (parity with M4-C activities)

```
(after SetupIntent success)
pending_approval → confirmed   (vendor/admin approve; no charge yet)
pending_approval → declined    (vendor/admin; no charge for line)
pending_approval → expired     (SLA job; releases calendar)
confirmed        → cancelled   (buyer/vendor/admin per product rules)
confirmed        → completed   (admin / post-stay; payout eligibility later)
```

Approve/decline is **per booking line** (each stay row), same as activities. Binary approval — no amount/date edits at approve time in MVP.

### Cart (`cart_lines`)

Tighten CHECKs:

- `line_type = 'accommodation'` ⇒ `accommodation_id`, `check_in`, `check_out`, `guests` all required; `slot_id` / `participants` null.
- `line_type = 'activity'` ⇒ existing activity CHECK (unchanged).

**Merge rule (MVP):** Same `(user_id, accommodation_id, check_in, check_out)` → one line; updating `guests` recomputes totals from current nightly rate × nights. Changing dates replaces or upserts as a distinct key (implementation choice; document in `lib/cart`).

**Checkout validator:** Accept activity-only, accommodation-only, or **mixed** carts. Re-validate each line kind (published, dates, guests, soft overlap, price snapshots). Order totals still come from cart line snapshots (`computeOrderTotalsFromCartLines`).

### Fulfillment after SetupIntent

Extend `fulfillM4cVendorApprovalRequestAfterSetupSaved` (and related Stripe paths):

1. For each **activity** cart line → existing `create_activity_booking_after_payment` / pending-approval RPC path.
2. For each **accommodation** cart line → `create_accommodation_booking_after_setup` (name illustrative): overlap lock / exclusion + insert `pending_approval` with `expires_at`.
3. Clear cart **only** when **all** line kinds succeeded.
4. On partial failure → compensate **both** tables for the order (extend or twin `cancel_*_bookings_for_order`), keep cart, fail order path consistently with today’s activity-only compensation.



### Approval, expiry, settlement


| Concern           | Behavior                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Approve / decline | Mirror `lib/orders/vendor-approval.ts` for stay rows (vendor owner of listing / site admin).                         |
| Expiry sweep      | Twin of `expire_pending_activity_bookings` for stays; then `syncOrderM4cAfterBookingChange` over **combined** lines. |
| Terminal gate     | No `pending_approval` remains on **either** table for the order.                                                     |
| Confirmed total   | `sum(confirmed.total_cents)` on **activities ∪ accommodations**.                                                     |
| Settlement PI     | Unchanged Stripe shape: **one** off-session `PaymentIntent` per order when gate passes and confirmed total > 0.      |


Update `computeConfirmedSettlementTotalCents` / `orderBookingsFullyResolvedForSettlement` call sites to pass **combined** line lists (or a small helper that merges both queries).

### RLS (mirror activities)

- Buyer: `SELECT` own rows; cancel own `confirmed` via RPC.
- Vendor: `SELECT` / approve-decline paths for `vendor_id` owned listings.
- Admin: `FOR ALL` where `is_site_admin()`.
- **No** authenticated `INSERT` for ordinary users.



### RPCs (illustrative names)


| RPC                                        | Role                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `create_accommodation_booking_after_setup` | Service role; overlap + insert `pending_approval`                                                     |
| `cancel_accommodation_bookings_for_order`  | Service role; compensate fulfillment                                                                  |
| `expire_pending_accommodation_bookings`    | Service role; SLA sweep → `expired`                                                                   |
| `cancel_accommodation_booking`             | Authenticated; own `confirmed` → `cancelled`                                                          |
| Confirm / decline                          | Prefer shared patterns with activity confirm/decline RPCs or typed service updates under existing RLS |


---



## Alternatives considered



### Stuff stays into `activity_bookings` / fake slots

Rejected — incompatible inventory (range vs headcount), nullable pollution, and capacity math becomes unreadable.

### Blocked-ranges calendar in MVP

Deferred — M4-C vendor approval already covers off-platform conflicts; open calendar + exclusion is enough to prevent on-platform double booking. Blocked ranges can ship later without changing the booking ledger.

### Rate calendar / `price_max_usd` bands

Deferred — Phase 2 uses flat `price_min_usd` only. `price_max_usd` remains display/marketing until a rate table exists.

### Charge at cart add or Checkout payment mode

Rejected — would diverge from ADR-M4-C and reintroduce refund-heavy failure modes for stays.

### Per-stay settlement PaymentIntents

Rejected — keep **one** order-level settlement charge (ADR-M4-C decision 4).

---



## Consequences

**Positive**

- Clean separation of slot vs stay inventory.
- Reuses proven SetupIntent → approve → settle money path; mixed carts become first-class.
- Exclusion constraint (or equivalent RPC) makes on-platform double-booking structurally hard.
- Flat nightly snapshot keeps money fields integer-cents and Stripe-aligned.

**Tradeoffs**

- Open calendar can over-promise vs offline bookings until the vendor declines (accepted; same class of risk as activities sold elsewhere).
- Null `max_guest_capacity` is honor-system until vendors fill the field.
- Settlement and expiry code must always query **two** booking tables — regression risk if one path is forgotten (mitigate with shared helpers + Vitest mixed-cart cases).
- Back-to-back date semantics (`[)` ranges) must be documented in vendor/buyer UX to avoid “Sunday overlap” confusion.

**Out of scope for Phase 2**

- Blocked / closed date ranges table and vendor calendar UI beyond basic unavailable hints.
- Seasonal or per-night rate tables.
- Deposit / split stay payments.
- Automatic Stripe refunds on post-settlement cancel (same product stance as activities).
- Guest cart / anonymous stay holds.

---



## Implementation checklist (non-binding; for follow-on PRs)

- [x] Migration: `accommodation_bookings` + RLS + overlap RPC(s) + cart CHECKs + types
- [x] Cart (backend): constants, `addOrMergeAccommodationLine`, list preview, API body shapes
- [ ] Cart / listing UI: detail CTA + cart stay cards (frontend handoff)
- [x] Checkout validator for mixed carts; Stripe setup totals not activity-only
- [x] Setup fulfillment creates stay rows; compensate both kinds
- [x] Vendor/admin approve/decline + expiry sweep for stays
- [x] Settlement helpers aggregate both tables
- [x] Vitest: cart checkout validate, setup fulfillment create/compensate, mixed settlement
- [x] Update `docs/architecture.md`, `docs/database.md`, money runbook; mark Phase 2 designed in ADR-M4-A
- [ ] Buyer/vendor listing UIs for stay bookings (frontend handoff)

---



## References

- Plan defaults: separate table; flat `price_min_usd`; M4-C flow; mixed carts allowed.
- Listing fields: `accommodations.price_min_usd`, `max_guest_capacity`, `check_in_time`, `check_out_time` ([migration](../../supabase/migrations/20260324120000_accommodations_and_vendor_profile.sql)).
- Cart placeholders: `[20260403120700_create_cart_lines.sql](../../supabase/migrations/20260403120700_create_cart_lines.sql)`.
- Stripe: Setup Intents, off-session PaymentIntents (see ADR-M4-C).

