# ADR-M4-B: Shopping Cart & Checkout (Activity Bookings)

**Status:** Accepted  
**Milestone:** M4 — Booking & Availability  
**Date:** 2026-04-01 (updated 2026-04-09)  
**Deciders:** UIV Travel development team  
**Related:** [ADR-M4-A: Booking & Availability](./ADR-M4-booking-availability.md) — slots, `activity_bookings`, `create_activity_booking_after_payment`, **`cancel_activity_bookings_for_order`** (fulfillment rollback).

---

## Context

Public users select an **activity slot** and **number of participants**, then add that selection to a **shopping cart**. They may add **one or more** activity lines before paying once for the whole cart. Payment is **100% upfront** for MVP (no deposit flow).

This ADR defines **cart storage**, **checkout**, **Stripe Checkout Session**, **`orders`**, and how paid orders become **`activity_bookings`** rows. Slot inventory, the atomic `create_activity_booking_after_payment` RPC, and `activity_bookings` shape are specified in [ADR-M4-A](./ADR-M4-booking-availability.md).

---

## Decision

- **Single cart per product strategy:** One logical cart can hold **multiple line types** over time. The schema includes **accommodation-oriented nullable columns** on cart lines even though **only `activity` lines are implemented in M4** UI/API — avoiding a painful migration when accommodation checkout ships (see [ADR-M4-A — Phase 2](./ADR-M4-booking-availability.md)).
- **Authenticated-only server cart:** Only **logged-in** users persist a cart in the database (RLS scoped to `auth.uid()`). There is **no** anonymous guest cart in MVP.
- **Persistence:** Cart lines live in the **DB** (not only `localStorage`).
- **No cart expiry:** Lines are not auto-deleted by TTL; **validation and price rules** apply at checkout and when building Stripe line items.
- **Inventory:** The cart **does not reserve** slot capacity. Capacity is enforced only when **`activity_bookings`** are created **after** successful payment (see flow below). **MVP** intentionally avoids **soft holds** and **manual capture** (Stripe) so the implementation stays simple; see § **Future payment and inventory enhancements (post-MVP)** for when to add those.
- **Payment unit:** Stripe **Checkout Session** is created for the **order** (collection of lines). **Stripe IDs live on `orders` only** for MVP — not duplicated on each `activity_bookings` row.
- **Source of truth:** **Stripe webhooks** (not the browser return URL) drive **paid** state and **booking creation**. Handlers must be **idempotent** (Stripe event id deduplication — see § Stripe integration).
- **`activity_bookings` inserts:** RLS grants **no `INSERT` to `authenticated`**. The verified webhook handler uses a **service-role** Supabase client so inserts succeed after payment without exposing that privilege to browsers. **Site admins** may still insert via the admin `FOR ALL` policy on `activity_bookings` (ADR-M4-A). This is a **hard DB rule** aligned with “paid checkout only” for normal users.
- **Partial failure after payment:** If any line cannot be fulfilled (e.g. slot sold out between cart add and capture), policy is **fail the whole order** and **refund** the Stripe charge — no partial fulfillment in MVP. **Compensating cancellation** of any bookings already inserted in the same webhook run uses **`cancel_activity_bookings_for_order`** (`SECURITY DEFINER`, **service_role** only) — see § Fulfillment failure and refund.
- **Cart clearing:** The cart is cleared **only after** a **successful** webhook path that creates bookings (or explicitly marks the order complete). It is **not** cleared merely when the Checkout Session is created (avoids losing the cart if the user abandons Stripe).
- **Pricing:** **Snapshot unit/total in cents on cart lines at add-to-cart** (commercial quote for the cart UI). **Immutable snapshot again on each `activity_bookings` row** at creation time (ledger). Integer **cents** avoids float drift and matches Stripe amounts. **No promotional or first-time discounts in MVP** — `discount_cents` / `line_discount_cents` remain **0**.
- **No customer `POST /api/activity-bookings`:** MVP does **not** expose a public create-booking endpoint. **“Book now”** uses **`POST /api/cart/lines`** (merge/add) and may redirect straight to **`POST /api/checkout`** when the product wants a one-tap flow — still backed by the same cart and checkout APIs.

---

## Data model

### `orders`

Checkout and payment aggregate. **Implementation detail:** prefer **reusing** a single `awaiting_payment` row per user when the user starts checkout again (see § Checkout session lifecycle) to limit orphan rows.

| Column | Purpose |
|--------|---------|
| `id` | UUID PK |
| `user_id` | `auth.users` — buyer |
| `status` | `awaiting_payment`, `paid`, `failed`, `cancelled`, `refunded` — check constraint + shared enum in `lib/orders` |
| `currency` | MVP: **`usd`** only |
| `subtotal_cents`, `discount_cents`, `total_cents` | Order totals at checkout creation (align with Stripe `amount_total`); **MVP: `discount_cents` = 0** |
| `stripe_checkout_session_id` | Unique when set (partial unique index) |
| `stripe_payment_intent_id` | Optional; populated when useful for refunds/support |
| `created_at`, `updated_at` | Audit |

**MVP:** Pay in full only — `total_cents` equals amount charged.

### `cart_lines`

**Table name:** **`cart_lines`** (not `shopping_cart_lines`). One row per line; **merged** lines for the same activity slot (see merge rule).

| Column | Purpose |
|--------|---------|
| `id` | UUID PK |
| `user_id` | Owner; FK → `auth.users` |
| `line_type` | `activity` \| `accommodation` — CHECK constraint; **MVP:** only `activity` is written |
| `slot_id` | FK → `availability_slots` when `line_type = 'activity'`; nullable for future accommodation-only lines |
| `participants` | Integer ≥ 1 when `line_type = 'activity'` |
| *Future nullable:* `accommodation_id`, `check_in`, `check_out`, `guests`, … | Present in schema early; unused until Phase 2 |
| `unit_price_cents`, `line_subtotal_cents`, `line_discount_cents` (default 0), `line_total_cents` | Snapshots at add/merge; **MVP: `line_discount_cents` = 0** |
| `created_at`, `updated_at` | Required |

**Denormalization:** **Do not** add `activity_id` / `vendor_id` on `cart_lines` for MVP. Resolve **`activity_id` / `vendor_id`** via `slot_id` → `availability_slots` when validating and when calling `create_activity_booking_after_payment` (single source of truth, fewer columns to drift).

**Merge rule (same slot):** `POST` with the same `(user_id, slot_id)` **merges**: **add `participants`**, recompute line totals from the **current** activity unit price × participants (MVP: no line discounts).

**Indexes:** Index on `(user_id)`. **Partial unique** on `(user_id, slot_id)` where `line_type = 'activity'` and `slot_id` is not null (at most one merged line per slot).

**CHECK constraints (conceptual):** e.g. `line_type = 'activity'` implies `slot_id` not null and `participants >= 1`; accommodation placeholders nullable as designed.

### Webhook idempotency (recommended)

| Table | Purpose |
|--------|---------|
| `stripe_webhook_events` | `stripe_event_id` (text, **unique**), `processed_at` timestamptz — insert-before-process; duplicate event ids return 200 without side effects |

**Why:** Stripe retries webhooks; deduplicating by **`event.id`** is the standard pattern and avoids double `paid` transitions or duplicate booking inserts.

---

## Stripe integration

- **Primary event:** **`checkout.session.completed`**. Treat payment as captured only when **`payment_status === 'paid'`** (and session `mode` matches product usage). Avoid also handling `payment_intent.succeeded` as a second primary path unless explicitly needed later — prevents double processing.
- **Correlation:** Set Checkout Session **`metadata.order_id`** to the **`orders.id`** UUID (string). Optionally set **`client_reference_id`** to the same value for Stripe Dashboard readability.
- **Service role:** Only the **`POST /api/webhooks/stripe`** handler (and any code it calls) uses the Supabase **service role** client for `create_activity_booking_after_payment`, order status updates, and `cancel_activity_bookings_for_order`. **Cart and checkout routes** use the normal **user JWT** server client.

---

## Checkout session lifecycle

- **One active checkout intent per user (MVP):** When the user calls **`POST /api/checkout`**, find an existing **`orders`** row for `user_id = auth.uid()` with **`status = 'awaiting_payment'`** (optionally ignore rows older than a defined staleness window, or mark stale rows `cancelled` — product choice).
- **Reuse** that row: recompute totals from current `cart_lines`, **update** `subtotal_cents` / `total_cents`, set **`stripe_checkout_session_id`** to the **new** session id from Stripe (replacing any previous id for that order).
- **Why:** Fewer orphan `awaiting_payment` rows, aligns with ADR “create or update `orders`,” and matches “one session per order” mentally.

---

## Checkout and fulfillment flow

1. **User** manages cart via API (authenticated).
2. **`POST /api/checkout`** validates **non-empty** cart: slots exist, activities **published**, participants within remaining capacity (**read-only** — does not lock inventory). Rejects with **400** when invalid.
3. Server **reuses or creates** `orders` in **`awaiting_payment`**, builds **Stripe Checkout Session** with **`metadata.order_id`**, amounts aligned with **`orders.total_cents`**, returns **`{ url }`** to hosted Checkout.
4. User pays on Stripe.
5. **Webhook** (`checkout.session.completed`, `payment_status === 'paid'`):
   - Verify **`stripe-signature`**.
   - **Idempotency:** if **`stripe_event_id`** already in **`stripe_webhook_events`**, return **200** immediately.
   - Load **`orders`** by **`metadata.order_id`**; verify session amount/currency vs **`orders.total_cents`** / **`orders.currency`**; on mismatch → **do not** fulfill; mark order failed and handle support (refund if payment captured — edge case).
   - Load **`cart_lines`** for that **`user_id`** (and ensure they belong to the same checkout context — the order row is the anchor).
   - **Idempotently** set order to **`paid`** if not already (safe if retried).
   - For each **`activity`** line, **`create_activity_booking_after_payment`** (service role) **sequentially** (simplest failure semantics). Pass cent fields from **cart line snapshots**; resolve **`activity_id` / `vendor_id`** from the slot.
   - **On any RPC failure after at least one line succeeded:** call **`cancel_activity_bookings_for_order(order_id)`** (service role), **refund** the PaymentIntent, set order to **`refunded`** or **`failed`** per convention; return **200** after recording the webhook event so Stripe stops retrying.
   - **On full success:** clear **`cart_lines`** for that **`user_id`** (whole cart).
6. Record **`stripe_event_id`** in **`stripe_webhook_events`**.

**Race:** Inventory can still be lost between cart and payment — **fail whole order + refund** remains the MVP policy (ADR).

---

## Webhook pricing and reconciliation

- **RPC inputs:** `create_activity_booking_after_payment` receives **`unit_price_cents`**, **`subtotal_cents`**, **`discount_cents`**, **`total_cents`** from **cart line snapshots** loaded by **`order_id`** — not recomputed from `activities` at webhook time (avoids races with vendor price edits).
- **Stripe as guardrail:** Compare Stripe session **`amount_total`** to **`orders.total_cents`** (and currency). **Mismatch** → do not fulfill with those line snapshots; refund path + failure state.

---

## Fulfillment failure and refund

- **`cancel_activity_booking`** (ADR-M4-A) is for **end users** cancelling their own row. It is **not** sufficient for webhook rollback.
- **`cancel_activity_bookings_for_order(p_order_id uuid)`** — **`SECURITY DEFINER`**, **`grant execute` to `service_role` only** — sets **`status = 'cancelled'`** for rows where **`order_id = p_order_id`** and **`status = 'confirmed'`** (narrow `WHERE`), updates **`updated_at`**. Invoked by the webhook after a partial insert failure, **before** or **after** Stripe refund depending on implementation order (bookings must not remain **confirmed** if the order is refunded for inventory failure).

---

## RLS

### `orders`

- **`authenticated`:** **`SELECT`**, **`INSERT`**, **`UPDATE`** where **`user_id = auth.uid()`**. **No `DELETE`** for users (MVP); abandoned rows remain for audit or are marked **`cancelled`** by a future job if needed.
- **Webhook:** **Service role** bypasses RLS for **`UPDATE`** on any row required for fulfillment and status correction.

### `cart_lines`

- **`authenticated`:** all operations **`user_id = auth.uid()`** (`USING` + `WITH CHECK`).

### `activity_bookings`

- Unchanged from ADR-M4-A; inserts via **service role** + **`create_activity_booking_after_payment`**; user cancel via **`cancel_activity_booking`**.

---

## API routes

Thin routes; logic in **`lib/cart/`**, **`lib/orders/`**, **`lib/activity-bookings/`**.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/cart` | User | Lists **`cart_lines`** for **`auth.uid()`** with **joined preview**: activity title, slot **`starts_at`**, **`max_capacity`**, **remaining capacity** (authenticated can sum **`activity_bookings`** per ADR-M4-A). |
| `POST` | `/api/cart/lines` | User | Body **`{ slotId, participants }`**. Add or **merge**; snapshot prices from current activity. Validates slot/activity (reject cancelled slot, unpublished activity). |
| `PATCH` | `/api/cart/lines/[id]` | User | **Update `participants` only** for that line; recompute snapshots from **current** activity price × participants. |
| `DELETE` | `/api/cart/lines/[id]` | User | Removes the line (**removal is not done via PATCH**). |
| `POST` | `/api/checkout` | User | Validates cart (same rules as merge where applicable), reuses/creates **`awaiting_payment`** **`orders`**, creates Stripe Checkout Session, returns **`{ url }`**. |
| `POST` | `/api/webhooks/stripe` | Stripe signature | Verifies **`stripe-signature`**; fulfillment flow in § Checkout and fulfillment flow. |

**Validation timing:** Reject stale or invalid slot/activity on **add-to-cart** and **again at checkout** (final gate).

**“Book now”:** **`POST /api/cart/lines`** then redirect to **cart** or **checkout** — no separate booking-create endpoint.

---

## Post-checkout UX (MVP)

- **Browser return URL** must **not** be treated as proof of payment (webhook is source of truth). Prefer a **“Processing…”** or **order-status** page that reflects **`orders.status`** after webhook processing, or poll **`GET /api/activity-bookings`** / orders when exposed.
- **Email** on refund or failure is **out of scope** for M4 (M6 — Notifications). Show clear in-app or support messaging when **`failed` / `refunded`** after inventory loss.

---

## Environment and operations

- **`STRIPE_SECRET_KEY`**, **`STRIPE_WEBHOOK_SECRET`** — server-only; document in **`docs/architecture.md`** (existing env table). **Vercel / production:** set env vars on the project, redeploy after secret changes; webhook URL is **`https://<public-host>/api/webhooks/stripe`** (see **Background Jobs / Webhooks** in `docs/architecture.md`).
- **Local dev:** Stripe CLI **`stripe listen --forward-to …/api/webhooks/stripe`**.
- **Production:** Register a **Webhook endpoint** in Stripe (**Workbench** or **Developers → Webhooks**); subscribe to **`checkout.session.completed`**; use the endpoint **signing secret** (`whsec_`) for `STRIPE_WEBHOOK_SECRET` in the matching Test/Live mode.

---

## Consequences

**Positive**

- One payment UX for multi-activity trips; aligns with Stripe Checkout Session line items.
- No ghost `pending_payment` rows blocking inventory while users browse.
- Order row is the support anchor for refunds and reconciliation.
- Explicit idempotency and rollback RPC keep webhook behavior testable and safe under retries.

**Negative / tradeoffs**

- Users can see “available” in cart but lose inventory at pay time — **error + refund** UX must be clear.
- Webhook path must be **reliable**; monitoring and alerting are recommended.
- Accommodation columns on `cart_lines` add nullable surface area until Phase 2 — acceptable for stated migration avoidance.

**Out of scope**

- Deposit / split payment (post-MVP).
- Guest cart and merge-on-login.
- Automatic cart TTL.
- Partial order fulfillment.

---

## Future payment and inventory enhancements (post-MVP)

**MVP** keeps payment and inventory **simple**: no slot reservation in the cart; Stripe Checkout uses **automatic capture** (the customer is charged when the session completes); the webhook creates **`activity_bookings`**; if fulfillment fails after charge, **fail whole order** — **`cancel_activity_bookings_for_order`** plus **refund** (per § Checkout and fulfillment flow). That is acceptable for an early build, **fake/test Stripe**, and learning before real commerce.

When transitioning to a **full production** build—or when **contention, refund volume, support load, or user scale** makes “pay first, refund if sold out” too costly or confusing—revisit the flow with:

1. **Checkout-window capacity holds (option 5):** Short-lived reservation of **`participants`** against a slot for the **Checkout Session** lifetime (or a defined TTL aligned with session expiry). Capacity shown during checkout subtracts holds; reduces races between concurrent payers without full cart-level TTL (option 3) unless product needs it later.

2. **Authorize, then capture after successful fulfillment (option 4):** Stripe **manual capture** (or equivalent): **authorize** at Checkout, run **`create_activity_booking_after_payment`** for all lines, **capture** only on full success; **void** authorization on failure so settlement matches inventory more closely than refund-after-capture.

These may be phased (e.g. holds first, then capture timing). They add migrations, listing/capacity math, webhook logic, and Stripe configuration—**explicitly out of scope for MVP** in favor of simplicity and shipping.

---

## Files to add (illustrative)

```
supabase/migrations/
  ..._create_cart_lines.sql
  ..._rls_cart_lines.sql
  ..._rls_orders.sql                    -- policies for orders (if not already present)
  ..._stripe_webhook_events.sql         -- idempotency table
  ..._cancel_activity_bookings_for_order.sql  -- SECURITY DEFINER; service_role only

lib/cart/
  service.ts, types.ts

lib/orders/
  service.ts, types.ts

src/app/api/cart/...
src/app/api/checkout/route.ts
src/app/api/webhooks/stripe/route.ts
```

Webhook handler implements payment verification, idempotency, booking creation, rollback, and cart clear per § Checkout and fulfillment flow.
