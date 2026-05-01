-- SLA expiry sweep: single DB time base for metrics and downstream sync targets.
-- Returns jsonb { expired_count, order_ids } from the same UPDATE … RETURNING (M4-C).

drop function if exists public.expire_pending_activity_bookings();

create function public.expire_pending_activity_bookings()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  with updated as (
    update public.activity_bookings b
    set status = 'expired'
    where b.status = 'pending_approval'
      and b.expires_at is not null
      and b.expires_at <= now()
    returning b.order_id
  )
  select jsonb_build_object(
    'expired_count', coalesce((select count(*)::int from updated), 0),
    'order_ids', coalesce(
      (
        select jsonb_agg(u.order_id order by u.order_id)
        from (select distinct order_id from updated where order_id is not null) u
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function public.expire_pending_activity_bookings() is
  'Sets pending_approval bookings with expires_at <= now() to expired. Returns jsonb: expired_count (integer row count from the update), order_ids (JSON array of distinct non-null order UUIDs from the same update; [] if none). M4-C; service_role only.';

revoke all on function public.expire_pending_activity_bookings() from public;
grant execute on function public.expire_pending_activity_bookings() to service_role;
