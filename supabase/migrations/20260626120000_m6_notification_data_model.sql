-- M6 notification data model. Preferences are user-owned; notification events
-- and delivery logs are service-role owned durable infrastructure records.

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_enabled boolean not null default true,
  daily_digest_enabled boolean not null default false,
  booking_updates_enabled boolean not null default true,
  provider_updates_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Per-user notification preferences for M6 email publishing.';

drop trigger if exists trg_notification_preferences_set_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists "Notification preferences user select own" on public.notification_preferences;
drop policy if exists "Notification preferences user insert own" on public.notification_preferences;
drop policy if exists "Notification preferences user update own" on public.notification_preferences;

create policy "Notification preferences user select own"
on public.notification_preferences
for select
to authenticated
using (user_id = auth.uid());

create policy "Notification preferences user insert own"
on public.notification_preferences
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Notification preferences user update own"
on public.notification_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'email'
    check (channel in ('email')),
  event_type text not null
    check (
      event_type in (
        'booking_confirmed',
        'booking_declined',
        'booking_expired',
        'payment_completed',
        'payment_failed',
        'order_receipt',
        'provider_booking_pending',
        'daily_digest'
      )
    ),
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'published',
        'sent',
        'skipped',
        'failed'
      )
    ),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_events is
  'Durable M6 notification outbox. Service role creates and mutates rows; browser clients have no policies.';

create index notification_events_user_id_created_at_idx
  on public.notification_events (user_id, created_at desc);

create index notification_events_status_created_at_idx
  on public.notification_events (status, created_at);

create unique index notification_events_dedupe_key_idx
  on public.notification_events (channel, event_type, dedupe_key)
  where dedupe_key is not null;

drop trigger if exists trg_notification_events_set_updated_at on public.notification_events;
create trigger trg_notification_events_set_updated_at
before update on public.notification_events
for each row execute function public.set_updated_at();

alter table public.notification_events enable row level security;

create table public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification_events (id) on delete cascade,
  provider_message_id text not null,
  event_type text not null
    check (
      event_type in (
        'send',
        'delivery',
        'bounce',
        'complaint',
        'reject'
      )
    ),
  raw_provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.email_delivery_events is
  'Email delivery lifecycle events for M6 notification auditing. Service role only.';

create index email_delivery_events_notification_id_created_at_idx
  on public.email_delivery_events (notification_id, created_at desc);

create index email_delivery_events_provider_message_id_idx
  on public.email_delivery_events (provider_message_id);

drop trigger if exists trg_email_delivery_events_set_updated_at on public.email_delivery_events;
create trigger trg_email_delivery_events_set_updated_at
before update on public.email_delivery_events
for each row execute function public.set_updated_at();

alter table public.email_delivery_events enable row level security;
