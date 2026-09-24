create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_notification_preferences_set_updated_at
  on public.notification_preferences;
create trigger trg_notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  channel text not null default 'email',
  recipient_email text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_vendor_id uuid references public.vendors(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  booking_id uuid references public.activity_bookings(id) on delete set null,
  idempotency_key text not null unique,
  resend_email_id text,
  status text not null default 'queued',
  attempts integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_channel_check
    check (channel in ('email')),
  constraint notification_deliveries_status_check
    check (
      status in (
        'queued',
        'sent',
        'failed',
        'delivered',
        'bounced',
        'complained',
        'suppressed',
        'skipped'
      )
    ),
  constraint notification_deliveries_attempts_check
    check (attempts >= 0)
);

drop trigger if exists trg_notification_deliveries_set_updated_at
  on public.notification_deliveries;
create trigger trg_notification_deliveries_set_updated_at
before update on public.notification_deliveries
for each row execute function public.set_updated_at();

create index if not exists notification_deliveries_recipient_user_idx
  on public.notification_deliveries(recipient_user_id, created_at desc);
create index if not exists notification_deliveries_recipient_vendor_idx
  on public.notification_deliveries(recipient_vendor_id, created_at desc);
create index if not exists notification_deliveries_order_idx
  on public.notification_deliveries(order_id);
create index if not exists notification_deliveries_booking_idx
  on public.notification_deliveries(booking_id);
create index if not exists notification_deliveries_retry_idx
  on public.notification_deliveries(status, attempts, created_at)
  where status = 'failed' and attempts < 3;
create index if not exists notification_deliveries_resend_email_id_idx
  on public.notification_deliveries(resend_email_id)
  where resend_email_id is not null;

alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists "Notification preferences read own"
  on public.notification_preferences;
create policy "Notification preferences read own"
on public.notification_preferences
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Notification preferences insert own"
  on public.notification_preferences;
create policy "Notification preferences insert own"
on public.notification_preferences
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Notification preferences update own"
  on public.notification_preferences;
create policy "Notification preferences update own"
on public.notification_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.notification_preferences from anon;
revoke all on public.notification_preferences from authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

revoke all on public.notification_deliveries from anon;
revoke all on public.notification_deliveries from authenticated;
grant all on public.notification_deliveries to service_role;
