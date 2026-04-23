# M4 → Phase 2 prerequisites

Checklist of hardening and follow-ups identified in code review before expanding M4 (phase 2). Items are ordered roughly by **severity** (financial / operational risk first).

---

## Critical — money or Stripe behavior

1. **`payment_intent.succeeded` amount / currency mismatch** — **addressed (explicit state + ack)**  
   **Strategy:** On mismatch between the succeeded settlement `PaymentIntent` and the app’s expected total (`computeConfirmedSettlementTotalCents`) or order currency, the order transitions to **`reconciliation_required`** via `markOrderReconciliationRequiredAfterSettlementMismatch` (`lib/orders/service.ts`), the event is still recorded in **`stripe_webhook_events`**, and **`POST /api/webhooks/stripe`** returns **200** (`reconciliation_required` fulfillment result) so Stripe does not retry indefinitely.  
   **Ops:** Treat **`reconciliation_required`** as manual follow-up: compare Stripe Dashboard vs `orders` / `activity_bookings`; align data or refund per your playbook. Migrations add **`order_settlement_mismatches`** for structured mismatch audit by Stripe event id when you wire or backfill it. See **“Settlement amount or currency mismatch”** and **“Decision: Settlement capture mismatch → …”** in `docs/architecture.md`.

2. **Settlement race: PI created before DB attach**  
   Off-session `PaymentIntent` with `confirm: true` can emit webhooks **before** `attachFirstSettlementPaymentIntent` commits. The code partially anticipates this (`updateOrderPaidAfterSettlementCapture` allows `awaiting_vendor_approval` or `payment_pending`), but **attach failure + cancel PI** can still overlap awkwardly with webhooks.  
   **Direction:** Document the intended ordering; add tests or idempotency checks so a succeeded PI is never “orphaned” without a clear order outcome.

---

## High — webhook retries and noise

3. **Throws before `stripe_webhook_events` insert**  
   Paths that `throw` (e.g. order not in an eligible status for setup fulfillment) return **500**; Stripe **retries indefinitely** and the event is **not** recorded.  
   **Direction:** For “bad data / not retryable” cases, prefer **200 + structured logging** (or a dead-letter / quarantine record), unless you explicitly want Stripe to retry until data is fixed.

4. **`order_not_found` on setup fulfillment**  
   Same class as above: **500** → retry storm; event not stored.  
   **Direction:** Ack + log + alert for investigation when metadata points at a missing order.

---

## Medium — correctness and maintainability

5. **SLA expiry sweep: pre-query vs RPC**  
   `runPendingApprovalExpirySweep` lists affected `order_id`s **before** `expire_pending_activity_bookings()`. Rare **clock / `now()` vs JS ISO** skew could theoretically desync “which orders to sync” from “which rows expired.”  
   **Direction:** Prefer a single source of truth (e.g. RPC returns affected `order_id`s, or one SQL path that both expires and returns orders to sync).

6. **`declineActivityOrderAsAdmin` vs `syncOrderM4cAfterBookingChange`**  
   Bulk admin decline uses a **direct** `updateOrderStatus(..., declined)` path instead of the shared post-change hook. Works today; easy to **drift** when phase 2 adds side effects.  
   **Direction:** Revisit for consistency or document why it must stay special-case.

---

## Product / MVP (document if not implementing yet)

7. **User cancel = DB only**  
   `cancel_activity_booking` sets **`confirmed` → `cancelled`**; there is **no** automated Stripe refund.  
   **Direction:** Terms of service, in-app copy, and support process (manual refund in Dashboard if needed).

---

## Suggested verification before phase 2

- [ ] Run through: setup → bookings → vendor approve → settlement success/failure (including retry path).  
- [ ] Confirm monitoring/logging exists for **amount mismatch** (orders in **`reconciliation_required`**) and **webhook failures** (even if MVP is “log + manual”).  
- [ ] Re-read [ADR-M4-C](../adrs/ADR-M4-C-pending-approval-checkout-and-payment.md) and update if any of the above decisions change the model.

---

*Derived from internal M4 implementation review; adjust priorities as product requirements evolve.*