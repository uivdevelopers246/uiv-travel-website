-- RLS for availability_slots (ADR-M4-A). Public read limited to non-cancelled slots
-- for published activities only; vendors and admins match activities/accommodations patterns.

alter table public.availability_slots enable row level security;

drop policy if exists "Availability slots public select" on public.availability_slots;
drop policy if exists "Availability slots vendor manage" on public.availability_slots;
drop policy if exists "Availability slots admin manage" on public.availability_slots;

-- SELECT: anon + authenticated — published activity only, slot not cancelled.
create policy "Availability slots public select"
on public.availability_slots
for select
to anon, authenticated
using (
  is_cancelled = false
  and exists (
    select 1
    from public.activities a
    where a.id = activity_id
      and a.status = 'published'
  )
);

-- ALL: vendor owner for their vendor (any activity status, including cancelled slots).
create policy "Availability slots vendor management"
on public.availability_slots
for all
to authenticated
using (public.is_vendor_owner(vendor_id))
with check (public.is_vendor_owner(vendor_id));

-- ALL: site admins.
create policy "Availability slots admin management"
on public.availability_slots
for all
to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());
