# Accommodation booking

Accommodation requests use the existing activity payment flow: save a card in Stripe, reserve the dates as a pending request, let the vendor approve or decline, then charge once for the confirmed lines after every request is resolved. The approval period is 24 hours. Declined and expired requests are not charged. Activities and stays can share one cart and order.

## Customer and vendor behavior

- Published properties have a booking calendar with a USD price on each available day. Unpriced, closed, past, and reserved nights are darkened. Guests select check-in and check-out in the calendar (or date fields), then party size; the selected range is highlighted and the per-night quote comes from the server. Calendar selections cannot cross an unavailable night, but guests can check out on that morning. Displayed minimum and maximum nightly prices are calculated from the currently bookable calendar nights, never entered in the listing form. The range excludes past or closed nights and nights held by a confirmed or active pending booking. No bookable nights means no displayed price; one rate is shown as a single price.
- Hosts use **My Listings → Manage Accommodations → Calendar & prices** to choose a first and last night (both inclusive), set the USD price per night, and open the range. They can set different rates for different ranges or block nights. Unconfigured nights are closed. Ranges and stays are limited to 366 nights.
- Each listing is one whole-property reservation. The stay total is the sum of `accommodation_nights.price_cents` for each occupied night, independent of guest count. `max_guest_capacity` limits guests when set. The legacy `unit_price_cents` snapshot stores the minimum nightly rate; it must never be multiplied to calculate a varied-rate stay.
- Stays use `[check_in, check_out)` date ranges, so one guest may check out on the next guest's check-in day. Date validation uses UTC calendar dates, consistently with the database.
- The cart does not reserve dates. Successful Stripe setup creates the pending reservation. Another guest winning the dates before that step causes fulfillment to roll back without a charge.
- The vendor's **My Listings → Bookings** dashboard includes accommodation requests, listing filters, dates, guests, deadlines, and approve/decline actions. **My Trip → Bookings** shows the customer's stays and payment status.
- Payment recovery for an eligible failed stay collects a replacement card and requires fresh vendor approval. A stay whose check-in date has passed requires support.

## Safeguards

Calendar edits, booking creation, and approval lock the accommodation row, preventing competing requests from reserving the same nights. Host calendar access is restricted to the owner or an administrator, and hosts cannot edit or block nights with an active pending or confirmed booking. Existing reservations retain their agreed total. Approval rejects expired holds and rechecks overlapping reservations. Booking creation verifies listing/vendor/order ownership, guest capacity, full open-night coverage, and the sum of current nightly prices; writable cart price snapshots are not trusted.

Guests see a nightly breakdown before adding a stay. The cart API checks the reviewed quote total, and guest-count edits and checkout reject changed prices until the guest reviews the stay again. Closed nights cannot be bridged by a longer stay. Blocking a previously priced range retains its prices for host reference, but reopening requires an explicit nightly price. Available nights must cost at least $0.50 USD, consistent with Stripe's [minimum USD charge](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts); free stays are not supported by this approval-and-payment flow.

New Stripe Checkout sessions carry a SHA-256 fingerprint of the reviewed cart in both session and SetupIntent metadata. Changing dates, guests, prices, or items while Stripe is open requires starting checkout again. Duplicate webhook delivery preserves items added for another trip, and provider notifications are queued only after all requested holds have been created. Existing notification deduplication handles replay.

Direct authenticated execution of the old accommodation cancellation RPC is revoked: it bypassed order settlement and could release paid inventory. Post-payment cancellations/refunds remain an operations workflow, as for the existing activity flow.

## Deployment

1. Apply the prerequisite accommodation migrations (`20260726120000` through `20260726120300`) if missing, then `20260924120000_harden_accommodation_booking_inventory.sql` and `20260924130000_accommodation_nightly_calendar.sql`. Review `npx supabase migration list` and `npx supabase db push --dry-run` against the intended project before deployment. Both new migrations are required before enabling the application build. Hosts must open and price their bookable nights; existing listings are not automatically opened.
   Also apply `20261002120000_accommodation_bookable_price_ranges.sql` for automatic listing price ranges. It keeps the old price columns for compatibility but prevents hosts from writing them; the application derives display prices at read time so date rollover and expired holds are reflected without a background job.
   Apply `20261002130000_accommodation_booking_calendar.sql` for the guest-facing calendar. Its public RPC and `/api/accommodations/[id]/nights?from=YYYY-MM-DD&to=YYYY-MM-DD` return dates and bookable prices only; unavailable prices are null, and host calendar access remains restricted.
2. Configure the existing server variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL`.
3. Subscribe the Stripe endpoint `/api/webhooks/stripe` to `checkout.session.completed`, `setup_intent.succeeded`, `payment_intent.succeeded`, and `payment_intent.payment_failed` in the intended Stripe test/live environment.
4. Keep `/api/cron/pending-approval-expiry` scheduled with `CRON_SECRET`, and configure notification delivery/workers as described in [notifications.md](notifications.md).

The implementation reuses Stripe [Checkout setup mode](https://docs.stripe.com/payments/save-and-reuse-cards-only) and [SetupIntents](https://docs.stripe.com/api/setup_intents) to save payment credentials for the later off-session charge. No new dependencies or separate Stripe account are required.

## Verification

Run `npm run test:run -- --pool=threads --maxWorkers=4`, `npx tsc --noEmit`, and `npm run build`. Run `supabase/tests/accommodation_booking_inventory.sql`, `supabase/tests/accommodation_nightly_calendar.sql`, `supabase/tests/accommodation_bookable_price_ranges.sql`, and `supabase/tests/accommodation_booking_calendar.sql` through `psql -v ON_ERROR_STOP=1 -f ...` against a migrated development database; the scripts wrap test fixtures in transactions and roll back.

Before release, exercise Stripe test mode with a buyer and vendor account:

1. As a host, open a date range at $100 per night, override its weekend at $150 per night, and block one night. Check both inclusive range endpoints, ownership restrictions, and the property's Bookings link.
   Verify the listing displays $100–$150 per night. Close or reserve every $100 night and reload; the range should become $150. Close every remaining night and reload; it should show no available nights. The create/edit form must not offer manual minimum or maximum prices.
2. Request three open nights spanning both rates; confirm the total is the sum of the displayed nights and changing guests leaves it unchanged. A stay containing the blocked or unconfigured night must be unavailable. Change a rate after a guest quotes or adds a stay; require a new reviewed quote before checkout.
3. Save a test card; verify there is no charge and the stay appears pending in both dashboards. Attempt to change its nights as the host; the calendar must reject the edit.
4. Approve the stay; verify one settlement charge and paid status. Repeat with decline and expiry; verify no charge.
5. Request a mixed activity/stay order; approve one and decline the other. Verify only the approved amount is charged.
6. Try simultaneous overlapping requests and calendar edits, adjacent stays, past dates, excessive guests, and editing a cart while Stripe is open.
7. Deliver both setup success events and replay them. Verify a single reservation, deduplicated notifications, and preservation of subsequently added cart items.
8. Exercise a declined card and replacement-card recovery; the host must approve again before a new charge.

This branch was validated with automated application tests, production compilation, and PostgreSQL 17 using the actual accommodation migrations. The local database has also been migrated for manual testing. No remote migration or real payment was performed. Connected browser testing and the authenticated Stripe journey remain release checks.

Room/unit inventories, external calendar synchronization, vendor payouts, and self-service refunds are outside this whole-property booking flow.
