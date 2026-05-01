-- M4-C: settlement capture mismatch branch should be acknowledged (200) and moved to
-- reconciliation workflow, not retried forever. Add explicit order status and audit table.

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
      'expired',
      'reconciliation_required'
    )
  );

comment on constraint orders_status_check on public.orders is
  'M4-B/M4-C order lifecycle. reconciliation_required indicates a non-retryable settlement integrity mismatch requiring manual follow-up.';

create table public.order_settlement_mismatches (
  stripe_event_id text primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  stripe_payment_intent_id text not null,
  expected_amount_cents integer not null check (expected_amount_cents >= 0),
  captured_amount_cents integer not null check (captured_amount_cents >= 0),
  expected_currency text not null,
  captured_currency text not null,
  created_at timestamptz not null default now()
);

comment on table public.order_settlement_mismatches is
  'Audit trail for settlement capture mismatches acknowledged from Stripe webhook processing (manual reconciliation required).';

comment on column public.order_settlement_mismatches.stripe_event_id is
  'Stripe webhook event id used as idempotency key for mismatch audit writes.';

create index order_settlement_mismatches_order_created_idx
  on public.order_settlement_mismatches (order_id, created_at desc);

alter table public.order_settlement_mismatches enable row level security;
