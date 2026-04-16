-- ADR-M4-C: capacity counts confirmed + non-expired pending_approval; expires_at on create;
-- decline / expiry helpers; cancel_activity_bookings_for_order includes pending_approval rollback.

-- Replace 11-arg function with 12-arg (adds p_expires_at); avoid overload ambiguity.
drop function if exists public.create_activity_booking_after_payment(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, text
);

create or replace function public.create_activity_booking_after_payment(
  p_slot_id uuid,
  p_activity_id uuid,
  p_user_id uuid,
  p_vendor_id uuid,
  p_order_id uuid,
  p_participants integer,
  p_unit_price_cents integer,
  p_subtotal_cents integer,
  p_total_cents integer,
  p_discount_cents integer default 0,
  p_status text default 'confirmed',
  p_expires_at timestamptz default null
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

  if p_status not in ('confirmed', 'cancelled', 'completed', 'pending_approval') then
    raise exception 'invalid booking status';
  end if;

  if p_status = 'pending_approval' and p_expires_at is null then
    raise exception 'expires_at is required for pending_approval bookings';
  end if;

  select
    coalesce((
      select sum(b.participants)
      from public.activity_bookings b
      where b.slot_id = p_slot_id
        and (
          b.status = 'confirmed'
          or (
            b.status = 'pending_approval'
            and (b.expires_at is null or b.expires_at > now())
          )
        )
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
    total_cents,
    expires_at
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
    p_total_cents,
    case when p_status = 'pending_approval' then p_expires_at else null end
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_activity_booking_after_payment(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, text, timestamptz
) is
  'Locks slot, sums confirmed + non-expired pending_approval for capacity, inserts activity_bookings (M4-A/M4-C).';

revoke all on function public.create_activity_booking_after_payment(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, text, timestamptz
) from public;
grant execute on function public.create_activity_booking_after_payment(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, text, timestamptz
) to service_role;

-- Fulfillment rollback: cancel paid/confirmed lines and unreleased pending_approval holds.
create or replace function public.cancel_activity_bookings_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.activity_bookings
  set
    status = 'cancelled',
    expires_at = null
  where order_id = p_order_id
    and status in ('confirmed', 'pending_approval');
end;
$$;

comment on function public.cancel_activity_bookings_for_order(uuid) is
  'Sets activity_bookings for the order from confirmed or pending_approval to cancelled (M4-B rollback; M4-C unreleased holds).';

-- Vendor / admin decline before charge: pending_approval → declined (releases capacity).
create or replace function public.decline_activity_bookings_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.activity_bookings
  set
    status = 'declined',
    expires_at = null
  where order_id = p_order_id
    and status = 'pending_approval';
end;
$$;

comment on function public.decline_activity_bookings_for_order(uuid) is
  'Sets pending_approval bookings for the order to declined (M4-C); clears expires_at.';

revoke all on function public.decline_activity_bookings_for_order(uuid) from public;
grant execute on function public.decline_activity_bookings_for_order(uuid) to service_role;

-- Cron / job: pending_approval past SLA → expired (no Stripe calls).
create or replace function public.expire_pending_activity_bookings()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.activity_bookings b
    set status = 'expired'
    where b.status = 'pending_approval'
      and b.expires_at is not null
      and b.expires_at <= now()
    returning b.id
  )
  select count(*)::integer into v_count from updated;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.expire_pending_activity_bookings() is
  'Sets pending_approval bookings with expires_at <= now() to expired; returns row count (M4-C).';

revoke all on function public.expire_pending_activity_bookings() from public;
grant execute on function public.expire_pending_activity_bookings() to service_role;
