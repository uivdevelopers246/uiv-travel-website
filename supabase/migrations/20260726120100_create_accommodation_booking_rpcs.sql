-- Accommodation booking RPCs (ADR-M4-D). Overlap via listing lock + SELECT (no GiST EXCLUDE).
-- Soft-hold helper mirrors slot_platform_participants_booked grants for cart/public soft checks.

-- Soft overlap for cart add/update/preview.
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

-- Create after SetupIntent fulfillment: lock listing, reject overlapping holds, insert.
create or replace function public.create_accommodation_booking_after_setup(
  p_accommodation_id uuid,
  p_user_id uuid,
  p_vendor_id uuid,
  p_order_id uuid,
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_unit_price_cents integer,
  p_subtotal_cents integer,
  p_total_cents integer,
  p_discount_cents integer default 0,
  p_status text default 'pending_approval',
  p_expires_at timestamptz default null
)
returns public.accommodation_bookings
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_listing_vendor_id uuid;
  v_max_guest_capacity integer;
  v_listing_status text;
  v_row public.accommodation_bookings;
begin
  if p_guests < 1 then
    raise exception 'guests must be at least 1';
  end if;

  if p_check_out <= p_check_in then
    raise exception 'check_out must be after check_in';
  end if;

  if p_status not in ('confirmed', 'cancelled', 'completed', 'pending_approval') then
    raise exception 'invalid booking status';
  end if;

  if p_status = 'pending_approval' and p_expires_at is null then
    raise exception 'expires_at is required for pending_approval bookings';
  end if;

  select
    a.vendor_id,
    a.max_guest_capacity,
    a.status
  into
    v_listing_vendor_id,
    v_max_guest_capacity,
    v_listing_status
  from public.accommodations a
  where a.id = p_accommodation_id
  for update;

  if not found then
    raise exception 'Accommodation not found';
  end if;

  if v_listing_status <> 'published' then
    raise exception 'Accommodation is not published';
  end if;

  if v_listing_vendor_id <> p_vendor_id then
    raise exception 'Accommodation does not match vendor';
  end if;

  if v_max_guest_capacity is not null and p_guests > v_max_guest_capacity then
    raise exception 'guests exceed max_guest_capacity';
  end if;

  if exists (
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
      and b.check_in < p_check_out
      and p_check_in < b.check_out
  ) then
    raise exception 'Stay dates overlap an existing booking';
  end if;

  insert into public.accommodation_bookings (
    accommodation_id,
    user_id,
    vendor_id,
    order_id,
    check_in,
    check_out,
    guests,
    status,
    unit_price_cents,
    subtotal_cents,
    discount_cents,
    total_cents,
    expires_at
  ) values (
    p_accommodation_id,
    p_user_id,
    p_vendor_id,
    p_order_id,
    p_check_in,
    p_check_out,
    p_guests,
    p_status,
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

comment on function public.create_accommodation_booking_after_setup(
  uuid, uuid, uuid, uuid, date, date, integer, integer, integer, integer, integer, text, timestamptz
) is
  'Locks accommodation FOR UPDATE, rejects overlapping confirmed/non-expired pending_approval stays, inserts accommodation_bookings (ADR-M4-D).';

revoke all on function public.create_accommodation_booking_after_setup(
  uuid, uuid, uuid, uuid, date, date, integer, integer, integer, integer, integer, text, timestamptz
) from public;
grant execute on function public.create_accommodation_booking_after_setup(
  uuid, uuid, uuid, uuid, date, date, integer, integer, integer, integer, integer, text, timestamptz
) to service_role;

-- Fulfillment rollback: cancel paid/confirmed lines and unreleased pending_approval holds.
create or replace function public.cancel_accommodation_bookings_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.accommodation_bookings
  set
    status = 'cancelled',
    expires_at = null
  where order_id = p_order_id
    and status in ('confirmed', 'pending_approval');
end;
$$;

comment on function public.cancel_accommodation_bookings_for_order(uuid) is
  'Sets accommodation_bookings for the order from confirmed or pending_approval to cancelled (ADR-M4-D fulfillment rollback).';

revoke all on function public.cancel_accommodation_bookings_for_order(uuid) from public;
grant execute on function public.cancel_accommodation_bookings_for_order(uuid) to service_role;

-- SLA expiry sweep: returns jsonb { expired_count, order_ids } like activities.
create or replace function public.expire_pending_accommodation_bookings()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  with updated as (
    update public.accommodation_bookings b
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

comment on function public.expire_pending_accommodation_bookings() is
  'Sets pending_approval accommodation bookings with expires_at <= now() to expired. Returns jsonb: expired_count, order_ids. ADR-M4-D; service_role only.';

revoke all on function public.expire_pending_accommodation_bookings() from public;
grant execute on function public.expire_pending_accommodation_bookings() to service_role;

create or replace function public.confirm_pending_accommodation_booking_for_vendor(
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
  update public.accommodation_bookings b
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

comment on function public.confirm_pending_accommodation_booking_for_vendor(uuid, uuid) is
  'pending_approval → confirmed for one accommodation booking if vendor matches (ADR-M4-D).';

revoke all on function public.confirm_pending_accommodation_booking_for_vendor(uuid, uuid) from public;
grant execute on function public.confirm_pending_accommodation_booking_for_vendor(uuid, uuid) to service_role;

create or replace function public.decline_pending_accommodation_booking_for_vendor(
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
  update public.accommodation_bookings b
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

comment on function public.decline_pending_accommodation_booking_for_vendor(uuid, uuid) is
  'pending_approval → declined for one accommodation booking if vendor matches (ADR-M4-D).';

revoke all on function public.decline_pending_accommodation_booking_for_vendor(uuid, uuid) from public;
grant execute on function public.decline_pending_accommodation_booking_for_vendor(uuid, uuid) to service_role;

create or replace function public.confirm_pending_accommodation_booking_as_admin(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.accommodation_bookings b
  set
    status = 'confirmed',
    expires_at = null
  where b.id = p_booking_id
    and b.status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.confirm_pending_accommodation_booking_as_admin(uuid) is
  'pending_approval → confirmed for one accommodation booking (admin).';

revoke all on function public.confirm_pending_accommodation_booking_as_admin(uuid) from public;
grant execute on function public.confirm_pending_accommodation_booking_as_admin(uuid) to service_role;

create or replace function public.decline_pending_accommodation_booking_as_admin(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.accommodation_bookings b
  set
    status = 'declined',
    expires_at = null
  where b.id = p_booking_id
    and b.status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.decline_pending_accommodation_booking_as_admin(uuid) is
  'pending_approval → declined for one accommodation booking (admin).';

revoke all on function public.decline_pending_accommodation_booking_as_admin(uuid) from public;
grant execute on function public.decline_pending_accommodation_booking_as_admin(uuid) to service_role;

create or replace function public.decline_pending_accommodation_bookings_for_vendor_on_order(
  p_order_id uuid,
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
  update public.accommodation_bookings
  set
    status = 'declined',
    expires_at = null
  where order_id = p_order_id
    and vendor_id = p_vendor_id
    and status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.decline_pending_accommodation_bookings_for_vendor_on_order(uuid, uuid) is
  'Sets pending_approval accommodation bookings for one vendor on an order to declined; returns rows updated.';

revoke all on function public.decline_pending_accommodation_bookings_for_vendor_on_order(uuid, uuid) from public;
grant execute on function public.decline_pending_accommodation_bookings_for_vendor_on_order(uuid, uuid) to service_role;

create or replace function public.decline_accommodation_bookings_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.accommodation_bookings
  set
    status = 'declined',
    expires_at = null
  where order_id = p_order_id
    and status = 'pending_approval';
end;
$$;

comment on function public.decline_accommodation_bookings_for_order(uuid) is
  'Sets pending_approval accommodation bookings for the order to declined; clears expires_at.';

revoke all on function public.decline_accommodation_bookings_for_order(uuid) from public;
grant execute on function public.decline_accommodation_bookings_for_order(uuid) to service_role;
