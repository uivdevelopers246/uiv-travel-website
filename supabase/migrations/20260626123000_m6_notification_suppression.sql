-- M6 deliverability suppression metadata. User preferences remain user-owned,
-- while these fields are maintained by service-role webhook processing.

alter table public.notification_preferences
  add column if not exists email_suppressed_at timestamptz,
  add column if not exists email_suppressed_reason text
    check (
      email_suppressed_reason is null
      or email_suppressed_reason in ('bounce', 'complaint')
    ),
  add column if not exists email_suppressed_address text;

comment on column public.notification_preferences.email_suppressed_at is
  'Set by SES feedback handling after a hard bounce or complaint.';

comment on column public.notification_preferences.email_suppressed_reason is
  'SES feedback reason that caused system-level email suppression.';

comment on column public.notification_preferences.email_suppressed_address is
  'Email address suppressed by SES feedback handling.';
