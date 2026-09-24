-- ONLY run against a disposable copy of the pre-upgrade public schema.
-- Requires Supabase roles, auth.users and the legacy June 1 migration.
-- psql -v ON_ERROR_STOP=1 -f scripts/sql/test-notification-migrations.sql
-- All fixture rows and migration changes are rolled back after the assertions.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email)
select ('11111111-1111-4111-8111-' || lpad(n::text, 12, '0'))::uuid,
       'migration-test-' || n || '@example.com'
from generate_series(1, 5) as n;

insert into public.notification_preferences
  (user_id, email_enabled, disabled_reason, updated_at)
select ('11111111-1111-4111-8111-' || lpad(n::text, 12, '0'))::uuid,
       n = 5,
       (array['user_disabled', 'bounced', 'complained', 'suppressed', 'bounced'])[n],
       '2026-01-01T00:00:00Z'::timestamptz
from generate_series(1, 5) as n;

insert into public.notification_deliveries
  (event_type, recipient_email, recipient_user_id, idempotency_key, status)
select 'booking_confirmed', 'migration-test-' || n || '@example.com',
       ('11111111-1111-4111-8111-' || lpad(n::text, 12, '0'))::uuid,
       'migration-test-' || n,
       (array['bounced', 'complained', 'suppressed'])[n - 1]
from generate_series(2, 4) as n;

create temporary table original_preferences as
select user_id, email_enabled, disabled_reason, created_at
from public.notification_preferences;
create temporary table original_deliveries as
select * from public.notification_deliveries;

\ir ../../supabase/migrations/20260626120000_m6_notification_data_model.sql
\ir ../../supabase/migrations/20260626123000_m6_notification_suppression.sql
\ir ../../supabase/migrations/20260726120000_create_accommodation_bookings.sql
\ir ../../supabase/migrations/20260726120100_create_accommodation_booking_rpcs.sql
\ir ../../supabase/migrations/20260726120200_rls_accommodation_bookings.sql
\ir ../../supabase/migrations/20260726120300_cart_lines_accommodation_checks.sql
\ir ../../supabase/migrations/20260804150000_notification_delivery_reliability.sql
\ir ../../supabase/migrations/20260910120000_preserve_legacy_notification_suppression.sql

do $$
declare
  claimed integer;
begin
  if exists (
    select * from original_preferences
    except select user_id, email_enabled, disabled_reason, created_at
           from public.notification_preferences
  ) or (select count(*) from original_preferences) <>
       (select count(*) from public.notification_preferences) then
    raise exception 'Existing preference values were changed';
  end if;
  if exists (
    select * from original_deliveries except select * from public.notification_deliveries
  ) or (select count(*) from original_deliveries) <>
       (select count(*) from public.notification_deliveries) then
    raise exception 'Legacy delivery records were changed';
  end if;
  if (select count(*) from public.notification_preferences
      where user_id::text like '11111111-1111-4111-8111-%'
        and email_suppressed_at = '2026-01-01T00:00:00Z'::timestamptz
        and email_suppressed_reason = case disabled_reason
          when 'bounced' then 'bounce'
          when 'complained' then 'complaint'
          when 'suppressed' then 'provider_suppressed' end
        and email_suppressed_address is not null) <> 3 then
    raise exception 'Legacy provider suppression was not preserved';
  end if;
  if exists (
    select 1 from public.notification_preferences
    where user_id in ('11111111-1111-4111-8111-000000000001',
                      '11111111-1111-4111-8111-000000000005')
      and email_suppressed_at is not null
  ) then
    raise exception 'Ordinary opt-out or enabled account was incorrectly suppressed';
  end if;
  if (select count(*) from pg_class
      where oid in ('public.notification_preferences'::regclass,
                    'public.notification_events'::regclass,
                    'public.email_delivery_events'::regclass)
        and relrowsecurity) <> 3 then
    raise exception 'Row-level security is missing';
  end if;
  if has_table_privilege('authenticated', 'public.notification_events', 'truncate')
     or has_table_privilege('anon', 'public.email_delivery_events', 'select')
     or not has_table_privilege('service_role', 'public.notification_events', 'insert')
     or has_column_privilege('authenticated', 'public.notification_preferences',
                             'email_suppressed_at', 'update')
     or has_column_privilege('authenticated', 'public.notification_preferences',
                             'email_suppressed_reason', 'insert')
     or not has_column_privilege('authenticated', 'public.notification_preferences',
                                 'disabled_reason', 'update') then
    raise exception 'Notification table privileges are wrong';
  end if;
  if has_function_privilege('authenticated',
       'public.claim_notification_events(integer,uuid,uuid,integer)', 'execute')
     or has_function_privilege('anon',
       'public.claim_notification_events(integer,uuid,uuid,integer)', 'execute')
     or not has_function_privilege('service_role',
       'public.claim_notification_events(integer,uuid,uuid,integer)', 'execute') then
    raise exception 'Claim function permissions are wrong';
  end if;

  insert into public.notification_events (user_id, event_type, dedupe_key)
  values ('11111111-1111-4111-8111-000000000001', 'booking_confirmed', 'test-booking');
  select count(*) into claimed from public.claim_notification_events(
    1, '22222222-2222-4222-8222-222222222222');
  if claimed <> 1 or not exists (
    select 1 from public.notification_events
    where status = 'processing' and attempt_count = 1 and claimed_at is not null
  ) then
    raise exception 'Delivery claim did not work';
  end if;
  select count(*) into claimed from public.claim_notification_events(
    1, '33333333-3333-4333-8333-333333333333');
  if claimed <> 0 then
    raise exception 'Active delivery claim was claimed twice';
  end if;
end;
$$;

-- Exercise the real authenticated role and own-row policy, not just metadata.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-000000000001';
insert into public.notification_preferences (user_id, email_enabled, daily_digest_enabled)
values ('11111111-1111-4111-8111-000000000001', false, true)
on conflict (user_id) do update
set user_id = excluded.user_id,
    email_enabled = excluded.email_enabled,
    daily_digest_enabled = excluded.daily_digest_enabled;
do $$
begin
  if (select count(*) from public.notification_preferences) <> 1 then
    raise exception 'Own-row preference isolation failed';
  end if;
end;
$$;
reset role;

rollback;
select 'PASS: upgrade, legacy preservation, suppression, permissions, account upsert, and claims'
  as result;
