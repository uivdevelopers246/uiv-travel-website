-- Stripe webhook event idempotency (ADR-M4-B). RLS enabled with no anon/authenticated
-- policies so JWT clients cannot read or write; service_role bypasses RLS for insert/select.

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  processed_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Dedup Stripe event ids for webhook handlers (insert-before-process). Do not expose to the browser; use service role only (ADR-M4-B).';

alter table public.stripe_webhook_events enable row level security;
