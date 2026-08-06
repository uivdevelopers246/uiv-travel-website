-- Environment-safe notification delivery: atomic claims, bounded retries, and
-- idempotent provider feedback.

alter table public.notification_events
  drop constraint if exists notification_events_status_check;

alter table public.notification_events
  add constraint notification_events_status_check
  check (
    status in (
      'pending',
      'published',
      'processing',
      'sent',
      'skipped',
      'failed'
    )
  ),
  add column if not exists attempt_count integer not null default 0
    check (attempt_count >= 0),
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists status_reason text;

create index if not exists notification_events_delivery_eligibility_idx
  on public.notification_events (status, next_attempt_at, created_at)
  where channel = 'email';

create or replace function public.claim_notification_events(
  p_limit integer,
  p_claim_token uuid,
  p_notification_id uuid default null,
  p_lease_seconds integer default 300
)
returns setof public.notification_events
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select event.id
    from public.notification_events as event
    where event.channel = 'email'
      and (p_notification_id is null or event.id = p_notification_id)
      and (
        (
          event.status in ('pending', 'published')
          and event.next_attempt_at <= now()
        )
        or (
          event.status = 'processing'
          and event.claimed_at <= now() - make_interval(secs => greatest(p_lease_seconds, 1))
        )
      )
    order by event.next_attempt_at asc, event.created_at asc
    for update skip locked
    limit greatest(least(p_limit, 500), 0)
  ), claimed as (
    update public.notification_events as event
    set status = 'processing',
        attempt_count = event.attempt_count + 1,
        last_attempt_at = now(),
        claimed_at = now(),
        claim_token = p_claim_token,
        status_reason = null
    from candidates
    where event.id = candidates.id
    returning event.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_notification_events(integer, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_events(integer, uuid, uuid, integer)
  to service_role;

alter table public.email_delivery_events
  drop constraint if exists email_delivery_events_event_type_check;

alter table public.email_delivery_events
  add constraint email_delivery_events_event_type_check
  check (
    event_type in (
      'send',
      'sent',
      'delivery',
      'delivered',
      'delayed',
      'failed',
      'bounce',
      'bounced',
      'complaint',
      'complained',
      'suppressed',
      'reject'
    )
  ),
  add column if not exists provider_event_id text;

create unique index if not exists email_delivery_events_provider_event_id_idx
  on public.email_delivery_events (provider_event_id)
  where provider_event_id is not null;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_email_suppressed_reason_check;

alter table public.notification_preferences
  add constraint notification_preferences_email_suppressed_reason_check
  check (
    email_suppressed_reason is null
    or email_suppressed_reason in ('bounce', 'complaint', 'provider_suppressed')
  );
