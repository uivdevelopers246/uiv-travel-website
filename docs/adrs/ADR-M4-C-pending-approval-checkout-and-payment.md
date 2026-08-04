# ADR-M4-C: Pending-approval checkout & payment on confirmation

**Status:** Accepted  
**Milestone:** M4 — Booking & Availability (amendment)  
**Date:** 2026-04-13 (amended 2026-04-15)  
**Deciders:** UIV Travel development team  

**Related**

- **[ADR-M4-A: Booking & Availability](./ADR-M4-A-booking-availability.md)** — slots, `activity_bookings`, capacity math; **this ADR amends** when rows count toward capacity and how bookings are created.
- **[ADR-M4-B: Shopping Cart & Checkout](./ADR-M4-B-shopping-cart-and-checkout.md)** — cart, `orders`, Stripe; **this ADR supersedes** the “pay on Checkout Session completion, then create bookings” flow for the product direction below. Historical behavior remains documented in M4-B until fully migrated in code.
- **[ADR-M4-D: Accommodation Bookings](./ADR-M4-D-accommodation-bookings.md)** — extends this flow to stays and mixed carts; settlement aggregates both booking tables.

---



## Context

The original M4 checkout model ([ADR-M4-B](./ADR-M4-shopping-cart-and-checkout.md)) charges the customer **up front** via Stripe Checkout (`mode: "payment"`), then creates `activity_bookings` on `checkout.session.completed` when `payment_status === 'paid'`. Capacity is enforced **after** capture; the cart does not reserve inventory.

Stakeholders require **vendor (or site admin) approval before any charge**, so operators can avoid **double-booking** slots that may still be sold elsewhere (other platforms, phone, etc.). Users should **not** pay for bookings that cannot be fulfilled; **refunds should be rare**—declines should mean **no payment**, not refund-after-capture.

**Vendor payouts** (platform → vendor) are **out of scope** for this ADR; they are handled in a separate process. This ADR only covers **collecting payment from the customer** in Stripe for **approved** activity lines.

Accommodation checkout follows the same pattern; detailed stay inventory, pricing, and settlement aggregation are in **[ADR-M4-D](./ADR-M4-D-accommodation-bookings.md)**. This ADR states **activity-first** requirements and remains the money-flow source of truth for SetupIntent → approve → settle.

---



## Decision

1. **No charge at “checkout request” time.** The customer completes a **payment-method collection** flow only (Stripe **SetupIntent** or Stripe Checkout `mode: 'setup'`), attaching a **PaymentMethod** to a Stripe **Customer** for **off_session** use. **Zero** `PaymentIntent` amount is due at this step for the booking request itself.
2. **Booking requests are created in a pending state** after setup succeeds (server-verified via webhook). `activity_bookings` rows represent **requested** inventory and **reserve capacity** while the request is valid.
3. **Vendors (or site admins) approve or decline line items** within the SLA. **MVP:** approval is **binary**—no editing of amounts or participant counts at approve time.
4. **One customer charge per order (settlement).** The platform creates **one** `PaymentIntent` **only after every line on the order has reached a terminal state** (`confirmed`, `declined`, or `expired`) and **no** line is still `pending_approval`. The charge amount is the **sum of** `total_cents` **(or equivalent) for lines in** `confirmed` only. `payment_intent.succeeded` on that single intent is the revenue signal for the order.
5. **Approval SLA (MVP): 24 hours** from request creation. The SLA duration is defined by a **single shared constant** in application code. **Expiry** releases reserved capacity without charging.
6. **Decline or expiry before settlement:** **No charge** for those lines. If **no** line ends `confirmed`, the order is **not** charged.
7. **Roles:** **Vendor owners** approve or decline requests for their activities. **Site admins** may perform the same actions where product rules allow.
8. **Strict capacity (platform + off-platform):** For each `availability_slots` row, let `platform_booked` be the sum of `participants` on `activity_bookings` for that slot where `status` is `confirmed` or `pending_approval` (within SLA, not expired). Let `off_platform_participants` be a non-negative integer on the slot (vendor-reported seats sold outside this platform). **Invariant:** `platform_booked + off_platform_participants ≤ max_capacity`. The UI may show **remaining** for the platform as `max_capacity - off_platform_participants - platform_booked`; only `off_platform_participants` is stored as vendor input for off-platform usage.
9. **Lowering** `max_capacity`**:** A vendor (or admin) may decrease `max_capacity` only when the new value is still **≥** `platform_booked + off_platform_participants` after the edit—i.e. they cannot set a cap below seats already committed on-platform plus declared off-platform usage.
10. **Approve / decline granularity:** **Per booking line** (each `activity_bookings` row). Vendors and admins confirm or decline individual lines; bulk actions on an order may exist as convenience but are not the only path.
11. **Correlation:** Anchor checkout and settlement to `orders` and `metadata.order_id` on Stripe objects where applicable.
12. **Failed settlement charge (MVP):** **Single** retry/cancel path (e.g. order `payment_pending`); no per-vendor PaymentIntent complexity.
13. **Refunds:** Expected to be **rare** (e.g. short-notice vendor cancellation). **Partial refunds** may be added later; not required for MVP.

---



## Stripe integration (target)


| Phase               | Stripe object                                                  | Purpose                                                               |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Customer saves card | **SetupIntent** (or Checkout **setup** mode)                   | Collect and attach **PaymentMethod**; **no charge**.                  |
| Settlement          | **One** `PaymentIntent` per order (`off_session` when allowed) | Charge **sum of confirmed line totals** after all lines are terminal. |


- **Primary “payment completed” signal for revenue:** `payment_intent.succeeded` on the **settlement** PaymentIntent (not Checkout `payment_status: paid` from the old upfront flow).
- **SetupIntent / Checkout setup** webhooks: idempotent transition to **pending** bookings and order `awaiting_vendor_approval`.
- **Idempotency:** `stripe_webhook_events` for processed Stripe event ids; settlement charge id stored on `orders.stripe_payment_intent_id`.

**SCA / 3DS:** Document recovery (email link, retry, cancel) for failed off-session settlement; exact UX is follow-up.

---



## Data & capacity rules (target)

- **Platform capacity usage:** Sum `participants` for bookings where `status` is `confirmed` or `pending_approval` (not expired by SLA). **Declined**, **cancelled**, and **expired** rows do not consume capacity (subject to RPC definitions). Totals for enforcement and for slot edits should use the same definition the `slot_platform_participants_booked` (or equivalent) RPC returns so RLS and `SECURITY DEFINER` paths stay consistent.
- **Off-platform field:** `availability_slots.off_platform_participants` — vendor-maintained; included in `platform_booked + off_platform_participants ≤ max_capacity` checks (booking creation and slot PATCH validation).
- **Remaining (UI):** Derived as `max_capacity - off_platform_participants - platform_booked`; not persisted as the sole stored “remaining” value.
- **Slot reschedule / cancel:** While `platform_booked > 0`, the slot must not be rescheduled or soft-cancelled (pending and confirmed both block, matching `platform_booked`).
- **RLS & inserts:** `authenticated` cannot insert `activity_bookings` arbitrarily; pending rows use privileged paths (**service role** / `SECURITY DEFINER` **RPCs**).

---



## Operational & API expectations (non-binding)

- **Vendor dashboard:** List **booking requests** (pending), actions **Approve** / **Decline**.
- **Jobs:** Expire `pending_approval` past SLA; **no** Stripe capture on expiry.
- **Notifications:** Align with product milestones (e.g. M6).

---



## Consequences

**Positive**

- No charge until line items are resolved; **one** Stripe charge per order; simpler reconciliation than per-vendor PaymentIntents.
- **24-hour SLA** fits **SetupIntent** (no reliance on short-lived **authorization holds** as with manual capture).
- **Strict pending + confirmed** capacity reduces double-booking across channels **for inventory managed inside this system**.

**Tradeoffs**

- **Time to capture** may wait until the **last** line resolves (within SLA).
- **Implementation complexity** vs M4-B: setup flow, approval APIs, expiry job, webhooks.

**Supersedes (product direction)**

- Upfront **Checkout Session** `mode: payment` as the **primary** path for activity booking requests is **replaced** by this document for the approved MVP. Per-vendor approval-time PaymentIntents are **not** part of the target design.

---



## Implementation checklist (for future PRs; not exhaustive)

- [x] Shared SLA constant + expiry job  
- [x] Stripe Customer + Checkout setup; correlate `order_id`  
- [x] Pending `activity_bookings` + capacity RPCs  
- [x] Approve/decline APIs: **DB only** (confirm/decline per vendor or admin); **no** charge on approve  
- [x] **Settlement:** one `PaymentIntent` when all lines terminal; amount = sum of confirmed lines; webhook → `paid`  
- [x] Decline / expiry paths without capture  
- [x] Update `docs/architecture.md` webhook table  
- [x] Vitest coverage in `lib/` services  

---



## References

- Stripe: [Setup Intents](https://docs.stripe.com/payments/setup-intents), [Saving payment methods](https://docs.stripe.com/payments/save-and-reuse), [PaymentIntents](https://docs.stripe.com/payments/payment-intents), [Webhooks](https://docs.stripe.com/webhooks).

