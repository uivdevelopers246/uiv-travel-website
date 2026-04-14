# ADR-M4-C: Pending-approval checkout & payment on confirmation

**Status:** Accepted  
**Milestone:** M4 — Booking & Availability (amendment)  
**Date:** 2026-04-13  
**Deciders:** UIV Travel development team  

**Related**

- **[ADR-M4-A: Booking & Availability](./ADR-M4-booking-availability.md)** — slots, `activity_bookings`, capacity math; **this ADR amends** when rows count toward capacity and how bookings are created.
- **[ADR-M4-B: Shopping Cart & Checkout](./ADR-M4-shopping-cart-and-checkout.md)** — cart, `orders`, Stripe; **this ADR supersedes** the “pay on Checkout Session completion, then create bookings” flow for the product direction below. Historical behavior remains documented in M4-B until fully migrated in code.

---

## Context

The original M4 checkout model ([ADR-M4-B](./ADR-M4-shopping-cart-and-checkout.md)) charges the customer **up front** via Stripe Checkout (`mode: "payment"`), then creates **`activity_bookings`** on **`checkout.session.completed`** when **`payment_status === 'paid'`**. Capacity is enforced **after** capture; the cart does not reserve inventory.

Stakeholders now require **vendor (or site admin) approval before any charge**, so operators can avoid **double-booking** slots that may still be sold elsewhere (other platforms, phone, etc.). Users should **not** pay for bookings that cannot be fulfilled; **refunds should be rare**—declines should mean **no payment**, not refund-after-capture.

Accommodation checkout may follow the same pattern later; this ADR states **activity-first** requirements and keeps **accommodation** as a forward-compatible extension.

---

## Decision

1. **No charge at “checkout request” time.** The customer completes a **payment-method collection** flow only (Stripe **SetupIntent** or Stripe Checkout **`mode: 'setup'`**), attaching a **PaymentMethod** to a Stripe **Customer** for **off_session** use. **Zero** `PaymentIntent` amount is due at this step for the booking request itself.

2. **Booking requests are created in a pending state** after the SetupIntent succeeds (server-verified via webhook or client return + server confirmation—implementation detail). **`activity_bookings`** rows (or an equivalent pending request aggregate—see Consequences) represent **requested** inventory and **reserve capacity** while the request is valid.

3. **Charge occurs only when a vendor or site admin confirms** (fully or partially—see § Partial confirmation). The platform creates a **PaymentIntent** for the **confirmed amount** and confirms/captures it using the saved PaymentMethod. **Payment success** is the moment ledger/revenue is recognized for that confirmation.

4. **Approval SLA (MVP): 24 hours** from request creation. The SLA duration is defined by a **single shared constant** (e.g. `BOOKING_APPROVAL_SLA_HOURS` or `BOOKING_APPROVAL_SLA_MS`) in application code so it can change without hunting literals. **Expiry** releases reserved capacity and cancels the request without charging.

5. **Decline or expiry:** **No charge** and **no refund path**—there was no successful capture for that request. Stripe objects for “save card” remain governed by Stripe retention and product policy.

6. **Roles:** **Vendor owners** approve or decline requests for their activities. **Site admins** are **super-users**: they may perform the same approval actions as the vendor where product rules allow.

7. **Strict capacity:** **`pending_approval`** (within SLA, not expired) **and** **`confirmed`** bookings **both** count toward slot capacity. Goal: minimize conflict and deliver predictable UX (no silent overbooking).

8. **Correlation:** Continue to anchor checkout/booking requests to **`orders`** (and **`metadata.order_id`** on Stripe objects where applicable) so support and idempotency remain coherent. Exact **`orders.status`** enum extensions are an implementation detail; new states such as **`awaiting_vendor_approval`**, **`payment_pending`**, **`completed`**, **`declined`**, **`expired`** may be introduced as needed—align with `lib/orders` and migrations.

---

## Stripe integration (target)

| Phase | Stripe object | Purpose |
|--------|----------------|--------|
| Customer saves card | **SetupIntent** (or Checkout **setup** mode) | Collect and attach **PaymentMethod**; **no charge**. |
| Approval | **PaymentIntent** (`confirm: true`, **`off_session: true`** when allowed) | Charge **only** the **approved** amount. |

- **Primary “payment completed” signal for revenue:** **`payment_intent.succeeded`** (and/or **`charge.succeeded`**) on the **approval-time** PaymentIntent—not **`checkout.session.completed`** with **`payment_status: paid`** for the old upfront flow once migration is complete.
- **SetupIntent webhooks** (e.g. **`setup_intent.succeeded`**) support idempotent transition from “user finished card flow” to “pending booking request persisted.”
- **Idempotency:** Keep **`stripe_webhook_events`** (or equivalent) for all processed Stripe event ids; approval-time charges must also be **idempotent** on the application side (e.g. one charge per approved request revision).

**SCA / 3DS:** Saving a card may require customer authentication. **Off-session** charges after approval can fail if the bank requires **step-up** authentication. MVP should document at least one **recovery path** (e.g. email link to complete payment, or cancel approval with notification)—exact UX is product follow-up.

---

## Data & capacity rules (target)

- **Capacity formula:** Sum **`participants`** (or equivalent) for bookings tied to the slot where **`status`** is in **`{ pending_approval, confirmed }`** (names illustrative) **and** pending rows are **not expired** by SLA. **Declined**, **cancelled**, and **expired** rows do not consume capacity.
- **Partial confirmation:** If the product allows a vendor to confirm **fewer** participants or **fewer** lines than requested, the **PaymentIntent amount** MUST match **only** the confirmed portion; unconfirmed inventory is released.
- **RLS & inserts:** Today, **`authenticated`** cannot insert **`activity_bookings`** ([ADR-M4-A](./ADR-M4-booking-availability.md)). Pending-request inserts will continue to require **privileged** paths (**service role** and/or **`SECURITY DEFINER` RPCs**) so browsers cannot mint bookings without server rules. Exact policies will be updated in migrations when this ADR is implemented.

---

## Operational & API expectations (non-binding)

- **Vendor dashboard:** List **booking requests** (pending), actions **Approve** / **Decline** (and partial approve if supported).
- **Jobs:** A scheduled or queue-driven process **expires** requests past SLA, updates status, and **releases** capacity—no Stripe capture on expiry.
- **Notifications:** Email/push when request is submitted, approved, declined, or expired—align with notification milestones elsewhere (e.g. M6).

---

## Consequences

**Positive**

- No charge until commitment is mutual; fewer refunds and clearer UX when a slot cannot be honored.
- **24-hour SLA** fits **SetupIntent** (no reliance on short-lived **authorization holds** as with manual capture).
- **Strict pending + confirmed** capacity reduces double-booking across channels **for inventory managed inside this system**.

**Tradeoffs**

- **Implementation complexity** vs M4-B: SetupIntent flow, approval APIs, expiry job, new order/booking states, Stripe webhooks beyond **`checkout.session.completed`**.
- **Failed off-session charge** after approval requires explicit handling (retry, customer action, or release).
- External bookings (phone / other apps) are **not** visible to this system—operators must still align offline inventory; this ADR only enforces consistency **within** the platform’s booking data.

**Supersedes (product direction)**

- Upfront **Checkout Session `mode: payment`** as the **primary** path for activity booking requests, and “**create bookings only after paid webhook**” as the **only** path, are **replaced** by this document for the approved MVP. Code may migrate incrementally; until then, M4-B remains the implemented reference.

---

## Implementation checklist (for future PRs; not exhaustive)

- [ ] Shared SLA constant + expiry job  
- [ ] Stripe Customer + SetupIntent (or Checkout setup) wiring; store PM and correlate `order_id`  
- [ ] Pending booking/request rows + RPCs for capacity with **`pending_approval` + `confirmed`**  
- [ ] Vendor/admin approve → create PaymentIntent for confirmed amount; handle webhooks idempotently  
- [ ] Decline / expiry paths without capture  
- [ ] Update **`docs/architecture.md`** env/webhook table (new Stripe events if any)  
- [ ] Adjust or add Vitest coverage in **`lib/`** services  

---

## References

- Stripe: [Setup Intents](https://docs.stripe.com/payments/setup-intents), [Saving payment methods](https://docs.stripe.com/payments/save-and-reuse), [PaymentIntents](https://docs.stripe.com/payments/payment-intents), [Webhooks](https://docs.stripe.com/webhooks).
