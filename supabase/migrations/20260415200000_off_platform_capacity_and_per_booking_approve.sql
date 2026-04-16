-- Off-platform participants (vendor-reported seats sold elsewhere) + capacity rule:
-- platform_booked (confirmed + non-expired pending_approval) + off_platform_participants <= max_capacity.
-- Per-booking approve/decline RPCs; drop bulk vendor confirm-all on order.

alter table public.availability_slots
  add column if not exists off_platform_participants integer not null default 0
    check (off_platform_participants >= 0);

comment on column public.availability_slots.off_platform_participants is
  'Vendor-reported participants booked outside this platform; subtracted from max_capacity with platform bookings for remaining capacity.';

-- Capacity snapshot for cart/public (bypasses RLS so totals include all customers).
create or replace function public.slot_platform_participants_booked(p_slot_ids uuid[])
returns table (slot_id uuid, booked integer)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    s.id,
    coalesce(
      (
        select sum(b.participants)::integer
        from public.activity_bookings b
        where b.slot_id = s.id
          and (
            b.status = 'confirmed'
            or (
              b.status = 'pending_approval'
              and (b.expires_at is null or b.expires_at > now())
            )
          )
      ),
      0
    )
  from public.availability_slots s
  where s.id = any (p_slot_ids);
$$;

comment on function public.slot_platform_participants_booked(uuid[]) is
  'Sums platform participants (confirmed + non-expired pending_approval) per slot; SECURITY DEFINER for accurate capacity.';

revoke all on function public.slot_platform_participants_booked(uuid[]) from public;
grant execute on function public.slot_platform_participants_booked(uuid[]) to anon;
grant execute on function public.slot_platform_participants_booked(uuid[]) to authenticated;
grant execute on function public.slot_platform_participants_booked(uuid[]) to service_role;

-- Replace create_activity_booking_after_payment to include off_platform in capacity check.
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
  v_off_platform integer;
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
    coalesce(s.off_platform_participants, 0),
    s.activity_id,
    s.vendor_id
  into v_current_booked, v_max_capacity, v_off_platform, v_slot_activity_id, v_slot_vendor_id
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

  if v_current_booked + p_participants + v_off_platform > v_max_capacity then
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
  'Capacity: platform bookings (confirmed + non-expired pending_approval) + off_platform_participants <= max_capacity.';

drop function if exists public.confirm_pending_activity_bookings_for_vendor_on_order(uuid, uuid);

create or replace function public.confirm_pending_activity_booking_for_vendor(
  p_booking_id uuid,
  p_vendor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.activity_bookings b
  set
    status = 'confirmed',
    expires_at = null
  where b.id = p_booking_id
    and b.vendor_id = p_vendor_id
    and b.status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.confirm_pending_activity_booking_for_vendor(uuid, uuid) is
  'pending_approval → confirmed for one booking if vendor matches (M4-C).';

revoke all on function public.confirm_pending_activity_booking_for_vendor(uuid, uuid) from public;
grant execute on function public.confirm_pending_activity_booking_for_vendor(uuid, uuid) to service_role;

create or replace function public.decline_pending_activity_booking_for_vendor(
  p_booking_id uuid,
  p_vendor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.activity_bookings b
  set
    status = 'declined',
    expires_at = null
  where b.id = p_booking_id
    and b.vendor_id = p_vendor_id
    and b.status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.decline_pending_activity_booking_for_vendor(uuid, uuid) is
  'pending_approval → declined for one booking if vendor matches (M4-C).';

revoke all on function public.decline_pending_activity_booking_for_vendor(uuid, uuid) from public;
grant execute on function public.decline_pending_activity_booking_for_vendor(uuid, uuid) to service_role;

create or replace function public.confirm_pending_activity_booking_as_admin(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.activity_bookings b
  set
    status = 'confirmed',
    expires_at = null
  where b.id = p_booking_id
    and b.status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.confirm_pending_activity_booking_as_admin(uuid) is
  'pending_approval → confirmed for one booking (admin).';

revoke all on function public.confirm_pending_activity_booking_as_admin(uuid) from public;
grant execute on function public.confirm_pending_activity_booking_as_admin(uuid) to service_role;

create or replace function public.decline_pending_activity_booking_as_admin(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.activity_bookings b
  set
    status = 'declined',
    expires_at = null
  where b.id = p_booking_id
    and b.status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.decline_pending_activity_booking_as_admin(uuid) is
  'pending_approval → declined for one booking (admin).';

revoke all on function public.decline_pending_activity_booking_as_admin(uuid) from public;
grant execute on function public.decline_pending_activity_booking_as_admin(uuid) to service_role;
