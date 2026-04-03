-- Checkout and payment aggregate (ADR-M4-B). RLS policies: follow-up migration.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'awaiting_payment'
    check (
      status in (
        'awaiting_payment',
        'paid',
        'failed',
        'cancelled',
        'refunded'
      )
    ),
  currency text not null default 'usd',
  subtotal_cents integer not null,
  discount_cents integer not null default 0,
  total_cents integer not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_subtotal_non_negative check (subtotal_cents >= 0),
  constraint orders_discount_non_negative check (discount_cents >= 0),
  constraint orders_total_non_negative check (total_cents >= 0)
);

comment on table public.orders is
  'Checkout aggregate per user; Stripe session / payment intent IDs for reconciliation (ADR-M4-B).';

create unique index orders_stripe_checkout_session_id_key
  on public.orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index orders_user_id_idx on public.orders (user_id);

drop trigger if exists trg_orders_set_updated_at on public.orders;
create trigger trg_orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
