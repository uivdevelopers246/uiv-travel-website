-- The legacy sender stored provider suppression in disabled_reason. The new
-- sender checks email_suppressed_at, including for transactional messages.
-- Carry these decisions forward without changing user choices or old logs.
update public.notification_preferences as preference
set email_suppressed_at = preference.updated_at,
    email_suppressed_reason = case preference.disabled_reason
      when 'bounced' then 'bounce'
      when 'complained' then 'complaint'
      when 'suppressed' then 'provider_suppressed'
    end,
    email_suppressed_address = (
      select delivery.recipient_email
      from public.notification_deliveries as delivery
      where delivery.recipient_user_id = preference.user_id
        and delivery.status = preference.disabled_reason
      order by delivery.created_at desc, delivery.id desc
      limit 1
    )
where preference.email_suppressed_at is null
  and preference.email_enabled = false
  and preference.disabled_reason in ('bounced', 'complained', 'suppressed');

-- Keep both versions of the account settings API working while reserving
-- provider suppression fields for the service-role webhook handler.
revoke insert, update on public.notification_preferences from authenticated;
grant insert (user_id, email_enabled, disabled_reason, daily_digest_enabled,
              booking_updates_enabled, provider_updates_enabled)
  on public.notification_preferences to authenticated;
grant update (user_id, email_enabled, disabled_reason, daily_digest_enabled,
              booking_updates_enabled, provider_updates_enabled)
  on public.notification_preferences to authenticated;
