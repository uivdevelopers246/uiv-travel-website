-- M4-C single settlement charge: track first PI vs retry for payment_intent.payment_failed handling.

alter table public.orders
  add column if not exists settlement_charge_attempt_count integer not null default 0;

comment on column public.orders.settlement_charge_attempt_count is
  'M4-C: 1 after first settlement PaymentIntent is created, 2 after the single retry PI; used with webhooks.';
