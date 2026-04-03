# ADR-M4-B: Shopping Cart & Checkout (Activity Bookings)

**Status:** Accepted  
**Milestone:** M4 — Booking & Availability  
**Date:** 2026-04-01  
**Deciders:** UIV Travel development team  
**Related:** [ADR-M4-A: Booking & Availability](./ADR-M4-booking-availability.md) — slots, `activity_bookings`, `reserve_slot_capacity` RPC.

---

## Context

Public users select an **activity slot** and **number of participants**, then add that selection to a **shopping cart**. They may add **one or more** activity lines before paying once for the whole cart. Payment is **100% upfront** for MVP (no deposit flow).

This ADR defines **cart storage**, **checkout**, **Stripe Checkout Session**, **orders**, and how paid orders become **`activity_bookings`** rows. Slot inventory, the `reserve_slot_capacity` RPC, and `activity_bookings` shape are specified in [ADR-M4-A](./ADR-M4-booking-availability.md).

---

## Decision

- **Single cart per product strategy:** One logical cart can hold **multiple line types** over time. The schema includes **accommodation-oriented nullable columns** on cart lines even though **only `activity` lines are implemented in M4** UI/API — avoiding a painful migration when accommodation checkout ships (see [ADR-M4-A — Phase 2](./ADR-M4-booking-availability.md)).
- **Authenticated-only server cart:** Only **logged-in** users persist a cart in the database (RLS scoped to `auth.uid()`). There is **no** anonymous guest cart in MVP.
- **Persistence:** Cart lines live in the **DB** (not only `localStorage`).
- **No cart expiry:** Lines are not auto-deleted by TTL; **validation and price rules** apply at checkout and when building Stripe line items.
- **Inventory:** The cart **does not reserve** slot capacity. Capacity is enforced only when **`activity_bookings`** are created **after** successful payment (see flow below).
- **Payment unit:** Stripe **Checkout Session** is created for the **order** (collection of lines). **Stripe IDs live on `orders` only** for MVP — not duplicated on each `activity_bookings` row.
- **Source of truth:** **Stripe webhooks** (not the browser return URL) drive **paid** state and **booking creation**. Handlers must be **idempotent** (e.g. use Stripe event id or order idempotency keys) so retries do not duplicate bookings.
- **Partial failure after payment:** If any line cannot be fulfilled (e.g. slot sold out between cart add and capture), policy is **fail the whole order** and **refund** the Stripe charge — no partial fulfillment in MVP.
- **Cart clearing:** The cart is cleared **only after** a **successful** webhook path that creates bookings (or explicitly marks the order complete). It is **not** cleared merely when the Checkout Session is created (avoids losing the cart if the user abandons Stripe).
- **Pricing:** **Snapshot unit/total in cents on cart lines at add-to-cart** (commercial quote for the cart UI). **Immutable snapshot again on each `activity_bookings` row** at creation time (ledger). Integer **cents** avoids float drift and matches Stripe amounts. **No promotional or first-time discounts in MVP** — see § Data Model (`discount_cents` / `line_discount_cents` remain 0).

---

## Data Model

### `orders`

Checkout and payment aggregate. One row per Stripe Checkout Session (or equivalent) per user checkout attempt that reaches payment.

Suggested fields (exact names may vary in migrations):

| Column | Purpose |
|--------|---------|
| `id` | UUID PK |
| `user_id` | `auth.users` — buyer |
| `status` | e.g. `awaiting_payment`, `paid`, `failed`, `cancelled`, `refunded` — define enum in code + check constraint |
| `currency` | e.g. `usd` |
| `subtotal_cents`, `discount_cents`, `total_cents` | Order totals at checkout creation (align with Stripe amount); **MVP: `discount_cents` = 0** |
| `stripe_checkout_session_id` | Unique, nullable until session created |
| `stripe_payment_intent_id` | Optional; populated when useful for refunds/support |
| `created_at`, `updated_at` | Audit |

**MVP:** Pay in full only — `total_cents` equals amount charged.

### `cart_lines` (or `shopping_cart_lines`)

One row per cart line; **merged** lines for the same activity slot (see below).

| Column | Purpose |
|--------|---------|
| `id` | UUID PK |
| `user_id` | Owner of the cart |
| `line_type` | `activity` \| `accommodation` (only `activity` used in M4-phase 1) |
| `slot_id` | FK when `line_type = activity` |
| `participants` | Integer ≥ 1 for activity lines |
| *Future nullable:* `accommodation_id`, `check_in`, `check_out`, `guests`, … | Present in schema early per [Decision](#decision); unused until Phase 2 |
| `unit_price_cents`, `line_subtotal_cents`, `line_discount_cents`, `line_total_cents` | Snapshots at **add-to-cart** (and recomputed when merging lines — see merge rule); **MVP: `line_discount_cents` = 0** |
| `created_at`, `updated_at` | Optional |

**Merge rule (same slot):** Adding the same `(user_id, slot_id)` **merges** into one line: **add `participants`**, recompute line totals from the **current** activity unit price × participants (MVP: no line discounts).

**Indexes:** `(user_id)`, partial unique on `(user_id, slot_id)` where `line_type = 'activity'` and `slot_id` is not null, if product requires at most one merged line per slot.

---

## Checkout & Fulfillment Flow

1. **User** manages cart via API: add/update/remove lines (authenticated).
2. **Checkout** endpoint validates cart: slots still exist, activities still published, participants within remaining capacity **as if** booking now (read-only check — **does not** lock inventory).
3. Server creates or updates **`orders`** row in `awaiting_payment`, builds **Stripe Checkout Session** with line items and **metadata** (`order_id`, optional per-line ids).
4. User completes payment on **hosted** Stripe Checkout.
5. **Webhook** receives e.g. `checkout.session.completed` (and/or `payment_intent.succeeded` — **pick one primary event** in implementation to avoid double processing). Handler:
   - Verifies signature.
   - **Idempotently** marks order `paid` if not already.
   - In a **transaction**, for each cart line of type `activity`:
     - Call `reserve_slot_capacity(slot_id, participants)`.
     - Insert **`activity_bookings`** with `status = 'confirmed'`, **`order_id`** set, immutable price snapshot (`discount_cents` = 0 in MVP).
   - On **any** failure (slot full, slot cancelled, etc.): **rollback** booking inserts, **refund** the Stripe payment, set order to a failure/refunded state, **do not** leave orphan confirmed rows.
   - On **success**: clear **`cart_lines`** for that `user_id` (or for lines tied to this order if you snapshot line ids on the order — product choice: usually clear whole cart for simplicity).

**Note:** Because inventory is not held in the cart, **race** at step 5 is possible. The policy **fail whole order + refund** is the explicit MVP tradeoff.

---

## API Routes (illustrative)

Thin routes; logic in `lib/orders/`, `lib/cart/`, `lib/activity-bookings/`.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/cart` | User | List current user’s cart lines with joined activity/slot preview. |
| `POST` | `/api/cart/lines` | User | Add or **merge** activity line `{ slotId, participants }`; snapshot prices. |
| `PATCH` | `/api/cart/lines/[id]` | User | Update participants or remove. |
| `DELETE` | `/api/cart/lines/[id]` | User | Remove line. |
| `POST` | `/api/checkout` | User | Validate cart, create `orders` + Stripe Checkout Session, return `{ url }`. |
| `POST` | `/api/webhooks/stripe` | Stripe signature | Verify signature; process payment events; create bookings; idempotent. |

Existing **user booking list/detail** routes from ADR-M4-A remain; **direct `POST /api/activity-bookings`** without cart may be **removed** or replaced by “add to cart” + checkout — product choice: **“Book now”** can add one line and redirect to cart or checkout.

---

## RLS (high level)

- **`orders`:** Users `select`/`insert` (or only service role insert — prefer server creates orders) their own rows; vendors/admins as needed for support. **Stripe webhook** uses a **server path** with service role or security-definer function — **do not** expose secret to client; typical pattern is Edge Function or Next.js route with **webhook secret verification** then Supabase server client with sufficient privilege to insert bookings (subject to ADR-M4-A RLS — may require **privileged RPC** for booking insert after payment if RLS blocks user insert in webhook context; **design in implementation** to satisfy “no RLS bypass for normal users”).

- **`cart_lines`:** `user_id = auth.uid()` for all operations.

---

## Environment Variables

Same as ADR-M4-A: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (server-only). Document in `docs/architecture.md`.

---

## Consequences

**Positive**

- One payment UX for multi-activity trips; aligns with Stripe Checkout Session line items.
- No ghost `pending_payment` rows blocking inventory while users browse.
- Order row is the support anchor for refunds and reconciliation.

**Negative / tradeoffs**

- Users can see “available” in cart but lose inventory at pay time — requires clear **error and refund** UX.
- Webhook path must be **reliable**; idempotency and monitoring are mandatory.
- Accommodation columns on `cart_lines` add nullable surface area until Phase 2 — acceptable for stated migration avoidance.

**Out of scope**

- Deposit / split payment (post-MVP).
- Guest cart and merge-on-login.
- Automatic cart TTL.
- Partial order fulfillment.

---

## Files to Add (illustrative)

```
supabase/migrations/
  ..._create_orders.sql
  ..._create_cart_lines.sql
  ..._rls_orders.sql
  ..._rls_cart_lines.sql
  ..._activity_bookings_order_id_fk.sql   -- if not in initial activity_bookings migration

src/lib/cart/
  service.ts, types.ts

src/lib/orders/
  service.ts, types.ts

src/app/api/cart/...
src/app/api/checkout/route.ts
```

Webhook handler extends or replaces the thin `POST` described in ADR-M4-A for per-booking confirmation.
