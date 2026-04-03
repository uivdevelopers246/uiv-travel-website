-- RLS for activity_bookings (ADR-M4-A). User cancel via SECURITY DEFINER RPC so only
-- status → cancelled is allowed without a broad authenticated UPDATE policy.
-- Inserts: no policy for authenticated — rows are created only via service_role (Stripe webhook)
-- or site admin (admins_all_bookings FOR ALL). See ADR-M4-A / ADR-M4-B.

alter table public.activity_bookings enable row level security;

drop policy if exists "Activity bookings user select own" on public.activity_bookings;
drop policy if exists "Activity bookings user insert" on public.activity_bookings;
drop policy if exists "Activity bookings vendor select" on public.activity_bookings;
drop policy if exists "Activity bookings admin all" on public.activity_bookings;

-- Users see their own bookings
create policy "Activity bookings user select own"
on public.activity_bookings
for select
to authenticated
using (user_id = auth.uid());

-- Vendors see bookings for their vendor
create policy "Activity bookings vendor select"
on public.activity_bookings
for select
to authenticated
using (public.is_vendor_owner(vendor_id));

-- Admins full access (e.g. completed transition, support)
create policy "Activity bookings admin all"
on public.activity_bookings
for all
to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());

-- User cancel: confirmed → cancelled only; no other column changes
create or replace function public.cancel_activity_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.activity_bookings b
  set status = 'cancelled'
  where b.id = p_booking_id
    and b.user_id = auth.uid()
    and b.status = 'confirmed';

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Booking not found, not owned by caller, or not cancellable';
  end if;
end;
$$;

comment on function public.cancel_activity_booking(uuid) is
  'Sets activity_bookings.status to cancelled for the caller''s confirmed booking (ADR-M4-A).';

revoke all on function public.cancel_activity_booking(uuid) from public;
grant execute on function public.cancel_activity_booking(uuid) to authenticated;
grant execute on function public.cancel_activity_booking(uuid) to service_role;
