# M4 Activity Booking Operations Runbook

This MVP runbook covers the current activity checkout flow: save payment method, vendor
approval, then one Stripe settlement charge. It does not cover accommodation bookings.

## First checks

1. Find the `orders` row and its related `activity_bookings`.
2. In Stripe, find the PaymentIntent using `orders.stripe_payment_intent_id` or
   `metadata.order_id`.
3. Compare the Stripe status, amount, and currency with the order and the sum of
   `total_cents` for confirmed bookings.
4. Check the Stripe webhook delivery and application logs for the related event.

Never copy secrets, card data, or customer PII into this repository or support notes.
Do not directly edit financial or booking rows as an incident workaround.

## Order status guide

- `awaiting_payment`: payment-method setup has not completed.
- `awaiting_vendor_approval`: at least one booking still needs a vendor decision.
- `payment_pending`: the settlement charge is processing.
- `paid`: settlement succeeded.
- `declined` / `expired` / `cancelled`: the order ended without a charge.
- `failed`: settlement retries were exhausted.
- `reconciliation_required`: Stripe captured a result that does not match the expected
  amount or currency; manual review is required.

## Common cases

### `reconciliation_required`

Do not retry or replay the charge. Compare Stripe with `orders` and confirmed
`activity_bookings`. If the charge is incorrect, refund it manually in Stripe according
to the support policy. Leave the order in `reconciliation_required` until the discrepancy
has been deliberately resolved and documented.

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

### Booking cancellation

Customer cancellation currently changes a confirmed booking to `cancelled` in the
database only. It does **not** issue a Stripe refund. Check whether the order was paid and,
if the cancellation policy requires it, issue the refund manually in Stripe and record
the support decision outside this repository without PII.

## Escalate

Stop and investigate before taking further payment action when Stripe and the database
disagree, the same customer appears charged more than once, or a webhook continues to
return `500` after the underlying issue is fixed.
