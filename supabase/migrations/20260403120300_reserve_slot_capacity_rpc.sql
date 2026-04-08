-- Atomic capacity check + activity_bookings insert (ADR-M4-A).
-- Holds FOR UPDATE on the slot until the insert commits, so concurrent payers cannot
-- both pass a capacity check before either row exists.
-- SECURITY DEFINER: sum(participants) must see all confirmed rows regardless of RLS.
-- EXECUTE granted only to service_role: the function inserts rows; authenticated must not call it.

drop function if exists public.reserve_slot_capacity(uuid, integer);

create or replace function public.create_activity_booking_after_payment(
  p_slot_id uuid,
  p_activity_id uuid,
  p_user_id uuid,
  p_vendor_id uuid,
  p_order_id uuid,
  p_participants integer,
  p_unit_price_cents integer,
  p_subtotal_cents integer,
  p_discount_cents integer default 0,
  p_total_cents integer,
  p_status text default 'confirmed'
)
returns public.activity_bookings
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_booked integer;
  v_max_capacity integer;
  v_slot_activity_id uuid;
  v_slot_vendor_id uuid;
  v_row public.activity_bookings;
begin
  if p_participants < 1 then
    raise exception 'participants must be at least 1';
  end if;

  if p_status not in ('confirmed', 'cancelled', 'completed') then
    raise exception 'invalid booking status';
  end if;

  select
    coalesce((
      select sum(b.participants)
      from public.activity_bookings b
      where b.slot_id = p_slot_id
        and b.status = 'confirmed'
    ), 0),
    s.max_capacity,
    s.activity_id,
    s.vendor_id
  into v_current_booked, v_max_capacity, v_slot_activity_id, v_slot_vendor_id
  from public.availability_slots s
  where s.id = p_slot_id
    and s.is_cancelled = false
  for update;

  if not found then
    raise exception 'Slot not found or is cancelled';
  end if;

  if v_slot_activity_id <> p_activity_id or v_slot_vendor_id <> p_vendor_id then
    raise exception 'Slot does not match activity or vendor';
  end if;

  if v_current_booked + p_participants > v_max_capacity then
    raise exception 'Not enough capacity on this slot';
  end if;

  insert into public.activity_bookings (
    slot_id,
    activity_id,
    user_id,
    vendor_id,
    order_id,
    status,
    participants,
    unit_price_cents,
    subtotal_cents,
    discount_cents,
    total_cents
  ) values (
    p_slot_id,
    p_activity_id,
    p_user_id,
    p_vendor_id,
    p_order_id,
    p_status,
    p_participants,
    p_unit_price_cents,
    p_subtotal_cents,
    p_discount_cents,
    p_total_cents
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_activity_booking_after_payment(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, text
) is
  'Locks slot, verifies capacity and slot/activity/vendor alignment, inserts activity_bookings in one transaction (ADR-M4-A).';

revoke all on function public.create_activity_booking_after_payment(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, text
) from public;
grant execute on function public.create_activity_booking_after_payment(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, text
) to service_role;
