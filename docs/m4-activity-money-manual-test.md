# M4 Money Manual Test Checklist

Use this checklist for the shared M4-C money path (activities, stays, and mixed carts).
Run it only with test users, test listings, and Stripe **Test mode**. Never record secrets,
card data, or customer PII in this document.

## Prerequisites

- [ ] The database has all M4 migrations applied (including ADR-M4-D stay ledger / RPCs).
- [ ] `.env.local` contains the required Supabase, Stripe Test mode, site URL, and
      `CRON_SECRET` values.
- [ ] `STRIPE_SECRET_KEY` starts with a Stripe Test mode key, not a Live mode key.
- [ ] Stripe CLI is installed and authenticated.
- [ ] A buyer test account exists.
- [ ] A vendor test account owns a published activity with a positive price.
- [ ] The activity has enough future, non-cancelled slots to use a fresh slot per scenario.
- [ ] A vendor owns a published accommodation with usable `price_min_usd` and future
      check-in / check-out dates that do not overlap existing holds.
- [ ] For the mixed-line tests, a second published activity/slot and/or a stay listing exist.
      A second vendor is preferable because it also exercises independent vendor decisions.

## Start the local test environment

- [ ] In terminal 1, start the webhook forwarder:

  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  ```

- [ ] Put the CLI-provided `whsec_...` value in `STRIPE_WEBHOOK_SECRET` locally.
- [ ] In terminal 2, start the app after the webhook secret is set:

  ```bash
  npm run dev
  ```

- [ ] Confirm the app loads and Stripe CLI reports that it is ready.
- [ ] Keep Stripe CLI, the Stripe Test Dashboard, and the Supabase Table Editor available
      for read-only verification.

For successful setup, use Stripe's standard test card `4242 4242 4242 4242`, any future
expiry, and any valid CVC. For settlement failure, use Stripe's current Test mode card
documented as attachable to a Customer but declined when charged (commonly
`4000 0000 0000 0341`); confirm this behavior in Stripe's testing documentation first.

## Record for every scenario

- [ ] Scenario name and pass/fail result
- [ ] `orders.id`
- [ ] Related `activity_bookings.id` and/or `accommodation_bookings.id` values and statuses
- [ ] Expected amount in cents (sum of confirmed lines across both tables when mixed)
- [ ] Stripe SetupIntent and PaymentIntent IDs, when created
- [ ] Final Stripe PaymentIntent status, amount, and currency
- [ ] Relevant Stripe event IDs

Use IDs from test data only. Do not paste webhook payloads or secrets into the repository.

## 1. Happy path

- [ ] Sign in as the buyer.
- [ ] Add one activity slot and participant count to the cart.
- [ ] Confirm the cart total equals price per person multiplied by participants.
- [ ] Start checkout and save `4242 4242 4242 4242`.
- [ ] Confirm checkout creates no charge at payment-method setup time.
- [ ] Confirm the cart is cleared after the setup webhook succeeds.
- [ ] Confirm the order becomes `awaiting_vendor_approval`.
- [ ] Confirm one booking exists as `pending_approval` with the expected cent snapshots.
- [ ] Sign in as the owning vendor and approve the booking in `/my-listings/bookings`.
- [ ] Confirm the booking becomes `confirmed`.
- [ ] Confirm one settlement PaymentIntent is created with `metadata.flow = m4c_settlement`.
- [ ] Confirm its amount equals the confirmed booking total and its currency is `usd`.
- [ ] Confirm the PaymentIntent succeeds and the order becomes `paid`.
- [ ] Confirm `/my-trip/bookings` shows payment complete.

## 2. Decline without charge

- [ ] Repeat checkout with a fresh slot and the success test card.
- [ ] Confirm the order and booking reach `awaiting_vendor_approval` /
      `pending_approval`.
- [ ] As the vendor, decline the booking.
- [ ] Confirm the booking becomes `declined`.
- [ ] Confirm the order becomes `declined`.
- [ ] Confirm no settlement PaymentIntent or charge was created for the order.

## 3. Mixed decisions and one settlement

- [ ] Add two activity lines to one cart, preferably owned by different vendors.
- [ ] Complete payment-method setup with the success test card.
- [ ] Confirm two `pending_approval` bookings share one order.
- [ ] Approve the first booking.
- [ ] Confirm no settlement starts while the second booking remains `pending_approval`.
- [ ] Decline the second booking.
- [ ] Confirm only the approved booking is `confirmed`.
- [ ] Confirm exactly one settlement PaymentIntent is created.
- [ ] Confirm its amount equals only the confirmed booking's `total_cents`.
- [ ] Confirm the order becomes `paid`.

## 4. Settlement failure and payment recovery

- [ ] Checkout a fresh slot using the Stripe test card selected for attach-success /
      charge-failure behavior.
- [ ] Approve the pending booking.
- [ ] Confirm the first settlement attempt fails.
- [ ] Confirm the application makes only its single automatic retry.
- [ ] Confirm the order becomes `failed` with settlement attempt count `2`.
- [ ] Confirm the booking remains `confirmed` and no successful charge exists.
- [ ] As the buyer, start payment recovery from `/my-trip/bookings`.
- [ ] Save the success test card.
- [ ] Confirm the order returns to `awaiting_vendor_approval`.
- [ ] Confirm the confirmed booking is reopened as `pending_approval` with a fresh SLA.
- [ ] Approve it again as the vendor.
- [ ] Confirm the new settlement succeeds and the order becomes `paid`.
- [ ] Confirm there is only one successful charge for the order.

## 5. Expiry without charge

The approval SLA is 24 hours. Use a supported test-only fixture to create an already-due
pending booking, or leave the scenario open for the real SLA. Do not modify production
rows to accelerate this test.

- [ ] Create a one-line order in `pending_approval`.
- [ ] Wait until its `expires_at` is due, using the approved test setup above.
- [ ] Run the expiry endpoint with the local `CRON_SECRET`:

  ```bash
  read -s CRON_SECRET
  curl -H "Authorization: Bearer ${CRON_SECRET}" \
    http://localhost:3000/api/cron/pending-approval-expiry
  unset CRON_SECRET
  ```

- [ ] Confirm the response reports the expired count and affected order ID.
- [ ] Confirm the booking becomes `expired`.
- [ ] Confirm the order becomes `declined`.
- [ ] Confirm no settlement PaymentIntent or charge was created.

### Mixed approval and expiry settlement

- [ ] Create a two-line order with both bookings in `pending_approval`.
- [ ] Approve one booking and confirm no settlement starts while the other remains
      `pending_approval`.
- [ ] Wait until the other booking's `expires_at` is due, then run the expiry endpoint.
- [ ] Confirm the due booking becomes `expired` and the approved booking remains
      `confirmed`.
- [ ] Confirm exactly one settlement PaymentIntent is created with
      `metadata.flow = m4c_settlement`.
- [ ] Confirm its amount equals only the confirmed booking's `total_cents`.
- [ ] Confirm the settlement succeeds and the order becomes `paid`.

## 6. Cancellation after payment

- [ ] Use a successfully paid test order with a `confirmed` booking.
- [ ] Cancel the booking through the buyer UI/API.
- [ ] Confirm the booking becomes `cancelled`.
- [ ] Confirm the order remains `paid`.
- [ ] Confirm Stripe did not automatically refund the charge.
- [ ] Confirm this matches the MVP manual-refund policy in
      `docs/m4-activity-operations-runbook.md`.

## 7. Stay-only happy path

Where listing UI is not yet wired, drive cart via `POST /api/cart/lines` with
`{ accommodation_id, check_in, check_out, guests }` and approve via vendor/admin stay
approve APIs.

- [ ] Add one published stay (guests within capacity when set) to the cart.
- [ ] Confirm cart total equals nights × nightly cents from `price_min_usd`.
- [ ] Complete payment-method setup with the success test card (no charge at setup).
- [ ] Confirm one `accommodation_bookings` row is `pending_approval` with money snapshots.
- [ ] Approve the stay as the owning vendor (or admin).
- [ ] Confirm exactly one settlement PaymentIntent for the stay `total_cents`.
- [ ] Confirm the PaymentIntent succeeds and the order becomes `paid`.

## 8. Mixed activity + stay, one settlement

- [ ] Add one activity line and one accommodation line to the same cart.
- [ ] Complete payment-method setup; confirm both booking kinds are `pending_approval`.
- [ ] Approve the activity; confirm no settlement while the stay is still pending.
- [ ] Decline the stay (or expire it via the cron endpoint when testing SLA).
- [ ] Confirm settlement amount equals **only** the confirmed activity `total_cents`.
- [ ] Confirm the order becomes `paid` with a single successful charge.
- [ ] Optionally repeat with both lines confirmed and assert settlement equals the **sum**
      of both confirmed totals.

## Final acceptance

- [ ] Every required scenario has recorded evidence and a clear pass/fail result.
- [ ] No scenario produced more than one successful settlement charge per order.
- [ ] Every successful charge equals the sum of confirmed booking totals (activities ∪
      stays) in `usd`.
- [ ] Declined-only and expired-only orders produced no charge.
- [ ] Webhook deliveries returned the expected response and did not remain in a retry loop.
- [ ] Stay-only and mixed-cart scenarios above passed or are tracked as known FE gaps.
