-- Soft overlap helper for cart add/update/preview (ADR-M4-D).
-- SECURITY DEFINER so RLS cannot hide other buyers' inventory holds.

create or replace function public.accommodation_stay_is_held(
  p_accommodation_id uuid,
  p_check_in date,
  p_check_out date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.accommodation_bookings b
    where b.accommodation_id = p_accommodation_id
      and (
        b.status = 'confirmed'
        or (
          b.status = 'pending_approval'
          and (b.expires_at is null or b.expires_at > now())
        )
      )
      -- half-open [check_in, check_out) overlap
      and b.check_in < p_check_out
      and p_check_in < b.check_out
  );
$$;

comment on function public.accommodation_stay_is_held(uuid, date, date) is
  'True when a confirmed or non-expired pending_approval stay overlaps [p_check_in, p_check_out); SECURITY DEFINER for accurate soft holds under RLS.';

revoke all on function public.accommodation_stay_is_held(uuid, date, date) from public;
grant execute on function public.accommodation_stay_is_held(uuid, date, date) to anon;
grant execute on function public.accommodation_stay_is_held(uuid, date, date) to authenticated;
grant execute on function public.accommodation_stay_is_held(uuid, date, date) to service_role;
