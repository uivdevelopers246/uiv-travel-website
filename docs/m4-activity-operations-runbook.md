# M4 Booking Operations Runbook

This MVP runbook covers the shared M4-C money path for **activity** and **accommodation**
bookings (including **mixed** carts): save payment method, vendor approval per line, then
one Stripe settlement charge for the sum of confirmed lines.

## First checks

1. Find the `orders` row and its related `activity_bookings` **and** `accommodation_bookings`
   (a mixed order can have rows in both tables).
2. In Stripe, find the PaymentIntent using `orders.stripe_payment_intent_id` or
   `metadata.order_id`.
3. Compare the Stripe status, amount, and currency with the order and the sum of
   `total_cents` for **confirmed** bookings across **both** booking tables.
4. Check the Stripe webhook delivery and application logs for the related event.

Never copy secrets, card data, or customer PII into this repository or support notes.
Do not directly edit financial or booking rows as an incident workaround.

## Order status guide

- `awaiting_payment`: payment-method setup has not completed.
- `awaiting_vendor_approval`: at least one activity or stay booking still needs a vendor
  decision.
- `payment_pending`: the settlement charge is processing.
- `paid`: settlement succeeded.
- `declined` / `expired` / `cancelled`: the order ended without a charge.
- `failed`: settlement retries were exhausted.
- `reconciliation_required`: Stripe captured a result that does not match the expected
  amount or currency; manual review is required.

## Common cases

### `reconciliation_required`

Do not retry or replay the charge. Compare Stripe with `orders` and confirmed
`activity_bookings` **plus** `accommodation_bookings`. If the charge is incorrect, refund
it manually in Stripe according to the support policy. Leave the order in
`reconciliation_required` until the discrepancy has been deliberately resolved and
documented.

### `failed`

The first settlement failure receives one automatic retry. When the order is `failed`
with attempt count `2`, the buyer can update their payment method; this sends confirmed
bookings back through vendor approval. If recovery is unavailable or also fails, handle
the case manually with the customer and Stripe.

### Webhook failure

- `400`: verify the Stripe endpoint and `STRIPE_WEBHOOK_SECRET` belong to the same
  Test/Live environment.
- `500`: inspect application logs and service availability, fix the transient/system
  issue, then allow Stripe to retry or resend the event once.
- `200`: the event was acknowledged; do not resend it merely because its business outcome
  was ignored or required reconciliation.

### Partial setup fulfillment

If setup webhook fulfillment creates some booking rows then fails mid-cart, the app
compensates by cancelling pending/confirmed holds on **both** booking tables for that
order, reverts the order toward `awaiting_payment`, and **keeps the cart**. Do not clear
cart lines or invent missing stay/activity rows by hand; re-run checkout after the
underlying fault is fixed.

### Booking cancellation

Customer cancellation currently changes a confirmed booking to `cancelled` in the
database only. Activities use `POST /api/activity-bookings/[id]/cancel` →
`cancel_activity_booking`. Stays use the **`cancel_accommodation_booking`** RPC (same
no-auto-refund policy). It does **not** issue a Stripe refund. Check whether the
order was paid and, if the cancellation policy requires it, issue the refund manually in
Stripe and record the support decision outside this repository without PII.

### Stay-specific notes

- Inventory is date-range based (`[check_in, check_out)`). Back-to-back stays that share a
  boundary date do not overlap.
- Soft holds use non-expired `pending_approval` and `confirmed` rows; SLA expiry runs
  `expire_pending_accommodation_bookings` alongside the activity expiry RPC on
  `GET /api/cron/pending-approval-expiry`.
- Vendor/admin approve or decline stays via
  `/api/vendor/accommodation-bookings/[id]/{approve,decline}` and
  `/api/admin/accommodation-bookings/[id]/{approve,decline}` (same settlement hook as
  activities).

## Escalate

Stop and investigate before taking further payment action when Stripe and the database
disagree, the same customer appears charged more than once, or a webhook continues to
return `500` after the underlying issue is fixed.
