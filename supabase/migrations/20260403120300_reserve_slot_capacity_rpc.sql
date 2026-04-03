-- Capacity guard before inserting activity_bookings (ADR-M4-A).
-- SECURITY DEFINER: under RLS, invoker would not see other users' confirmed rows,
-- so sum(participants) would be wrong and overbooking possible.

create or replace function public.reserve_slot_capacity(
  p_slot_id uuid,
  p_participants integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_booked integer;
  v_max_capacity integer;
begin
  select
    coalesce((
      select sum(b.participants)
      from public.activity_bookings b
      where b.slot_id = p_slot_id
        and b.status = 'confirmed'
    ), 0),
    s.max_capacity
  into v_current_booked, v_max_capacity
  from public.availability_slots s
  where s.id = p_slot_id
    and s.is_cancelled = false
  for update;

  if not found then
    raise exception 'Slot not found or is cancelled';
  end if;

  if v_current_booked + p_participants > v_max_capacity then
    raise exception 'Not enough capacity on this slot';
  end if;
end;
$$;

comment on function public.reserve_slot_capacity(uuid, integer) is
  'Locks slot row and verifies confirmed participants + p_participants <= max_capacity (ADR-M4-A).';

revoke all on function public.reserve_slot_capacity(uuid, integer) from public;
grant execute on function public.reserve_slot_capacity(uuid, integer) to authenticated;
grant execute on function public.reserve_slot_capacity(uuid, integer) to service_role;
