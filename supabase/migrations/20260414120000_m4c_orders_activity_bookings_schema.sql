-- ADR-M4-C schema: extend orders / activity_bookings status values; Stripe correlation on orders;
-- booking expires_at + indexes for capacity (confirmed + non-expired pending_approval) and expiry sweeps.

-- ---------- orders ----------
alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'awaiting_payment',
      'awaiting_vendor_approval',
      'payment_pending',
      'paid',
      'failed',
      'cancelled',
      'refunded',
      'declined',
      'expired'
    )
  );

comment on constraint orders_status_check on public.orders is
  'M4-B pay-at-checkout plus M4-C save PM then approve then charge: awaiting_vendor_approval after setup; payment_pending while capturing; paid after successful charge; declined/expired without capture.';

alter table public.orders add column stripe_customer_id text;
alter table public.orders add column stripe_setup_intent_id text;
alter table public.orders add column stripe_approval_payment_intent_id text;

comment on column public.orders.stripe_customer_id is 'Stripe Customer for saved payment methods and off-session charges (M4-C).';
comment on column public.orders.stripe_setup_intent_id is 'SetupIntent id or Checkout setup session id for correlating setup completion webhooks.';
comment on column public.orders.stripe_approval_payment_intent_id is 'PaymentIntent created when vendor approves; used for idempotent capture on webhook retries (M4-C).';

create unique index orders_stripe_setup_intent_id_key
  on public.orders (stripe_setup_intent_id)
  where stripe_setup_intent_id is not null;

create unique index orders_stripe_approval_payment_intent_id_key
  on public.orders (stripe_approval_payment_intent_id)
  where stripe_approval_payment_intent_id is not null;

-- ---------- activity_bookings ----------
drop index if exists public.idx_activity_bookings_slot_status;

alter table public.activity_bookings drop constraint if exists activity_bookings_status_check;

alter table public.activity_bookings
  add constraint activity_bookings_status_check
  check (
    status in (
      'confirmed',
      'cancelled',
      'completed',
      'pending_approval',
      'declined',
      'expired'
    )
  );

alter table public.activity_bookings add column expires_at timestamptz;

comment on column public.activity_bookings.expires_at is
  'SLA deadline for pending_approval; null for legacy rows or statuses other than pending_approval.';

create index idx_activity_bookings_slot_confirmed
  on public.activity_bookings (slot_id)
  where status = 'confirmed';

create index idx_activity_bookings_slot_pending_approval
  on public.activity_bookings (slot_id, expires_at)
  where status = 'pending_approval';

create index idx_activity_bookings_pending_approval_expires_at
  on public.activity_bookings (expires_at)
  where status = 'pending_approval';
