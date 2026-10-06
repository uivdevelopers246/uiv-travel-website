-- The accommodation is one reservable property. Serialize creation and approval
-- on the listing, using half-open [check_in, check_out) stays throughout.
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
  v_listing public.accommodations;
  v_row public.accommodation_bookings;
  v_unit_price numeric;
  v_subtotal numeric;
begin
  if p_check_in is null or p_check_out is null or not isfinite(p_check_in)
    or not isfinite(p_check_out) or p_check_out <= p_check_in then
    raise exception 'check_out must be after check_in';
  end if;
  if p_check_in < (now() at time zone 'UTC')::date then
    raise exception 'check_in must not be in the past';
  end if;
  if p_guests is null or p_guests < 1 then
    raise exception 'guests must be at least 1';
  end if;
  if p_status is distinct from 'pending_approval' then
    raise exception 'Accommodation bookings require vendor approval';
  end if;
  if p_expires_at is null or not isfinite(p_expires_at) or p_expires_at <= now() then
    raise exception 'A future expires_at is required for pending_approval bookings';
  end if;

  select * into v_listing from public.accommodations
  where id = p_accommodation_id for update;
  if not found then
    raise exception 'Accommodation not found';
  end if;
  if v_listing.vendor_id is distinct from p_vendor_id then
    raise exception 'Accommodation does not match vendor';
  end if;
  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.user_id = p_user_id
      and o.currency = 'usd' and o.status = 'awaiting_vendor_approval'
  ) then
    raise exception 'Order is not awaiting vendor approval for this user';
  end if;

  -- Two setup webhooks can reach this RPC concurrently. Replay the same hold,
  -- instead of treating the first delivery as an unavailable stay and rolling it back.
  select * into v_row from public.accommodation_bookings b
  where b.order_id = p_order_id and b.accommodation_id = p_accommodation_id
    and b.check_in = p_check_in and b.check_out = p_check_out
    and (b.status = 'confirmed' or (b.status = 'pending_approval'
      and (b.expires_at is null or b.expires_at > now())))
  order by b.created_at limit 1;
  if found then
    if v_row.user_id is distinct from p_user_id
      or v_row.vendor_id is distinct from p_vendor_id
      or v_row.guests is distinct from p_guests
      or v_row.unit_price_cents is distinct from p_unit_price_cents
      or v_row.subtotal_cents is distinct from p_subtotal_cents
      or v_row.discount_cents is distinct from p_discount_cents
      or v_row.total_cents is distinct from p_total_cents then
      raise exception 'Booking replay does not match the existing stay';
    end if;
    return v_row;
  end if;

  if v_listing.status <> 'published' then
    raise exception 'Accommodation is not published';
  end if;
  if v_listing.max_guest_capacity is not null and p_guests > v_listing.max_guest_capacity then
    raise exception 'guests exceed max_guest_capacity';
  end if;
  v_unit_price := round(v_listing.price_min_usd * 100);
  v_subtotal := v_unit_price * (p_check_out - p_check_in);
  if v_unit_price is null or v_unit_price < 0 or v_unit_price > 2147483647
    or v_subtotal > 2147483647 then
    raise exception 'Accommodation price is not set or exceeds the booking limit';
  end if;
  -- No discounts are offered for stays yet. Do not trust writable cart snapshots.
  if p_unit_price_cents is distinct from v_unit_price
    or p_subtotal_cents is distinct from v_subtotal
    or p_discount_cents is distinct from 0
    or p_total_cents is distinct from v_subtotal then
    raise exception 'Accommodation price changed; refresh the cart before checkout';
  end if;
  if public.accommodation_stay_is_held(p_accommodation_id, p_check_in, p_check_out) then
    raise exception 'Stay dates overlap an existing booking';
  end if;

  insert into public.accommodation_bookings (
    accommodation_id, user_id, vendor_id, order_id, check_in, check_out,
    guests, status, unit_price_cents, subtotal_cents, discount_cents, total_cents, expires_at
  ) values (
    p_accommodation_id, p_user_id, p_vendor_id, p_order_id, p_check_in, p_check_out,
    p_guests, 'pending_approval', p_unit_price_cents, p_subtotal_cents, 0, p_total_cents, p_expires_at
  ) returning * into v_row;
  return v_row;
end;
$$;

comment on function public.create_accommodation_booking_after_setup(
  uuid, uuid, uuid, uuid, date, date, integer, integer, integer, integer, integer, text, timestamptz
) is 'Creates a pending vendor-approval stay with locked inventory, trusted prices, and idempotent setup replay.';

-- Private implementation shared by vendor and admin approval. Lock ordering
-- matches creation: listing first, then booking. Expired holds remain pending
-- for the existing expiry sweep to transition AND synchronize their orders.
create or replace function public.confirm_pending_accommodation_booking_locked(
  p_booking_id uuid,
  p_vendor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_accommodation_id uuid;
  v_booking public.accommodation_bookings;
begin
  select accommodation_id into v_accommodation_id
  from public.accommodation_bookings where id = p_booking_id;
  if not found then return 0; end if;

  perform 1 from public.accommodations where id = v_accommodation_id for update;
  select * into v_booking from public.accommodation_bookings
  where id = p_booking_id for update;
  if not found or v_booking.accommodation_id <> v_accommodation_id
    or v_booking.status <> 'pending_approval'
    or (p_vendor_id is not null and v_booking.vendor_id <> p_vendor_id)
    or v_booking.expires_at is null or v_booking.expires_at <= now()
    or v_booking.check_in < (now() at time zone 'UTC')::date then
    return 0;
  end if;
  if exists (
    select 1 from public.accommodation_bookings b
    where b.accommodation_id = v_accommodation_id and b.id <> p_booking_id
      and (b.status = 'confirmed' or (b.status = 'pending_approval'
        and (b.expires_at is null or b.expires_at > now())))
      and b.check_in < v_booking.check_out and v_booking.check_in < b.check_out
  ) then
    return 0;
  end if;

  update public.accommodation_bookings set status = 'confirmed', expires_at = null
  where id = p_booking_id;
  return 1;
end;
$$;

revoke all on function public.confirm_pending_accommodation_booking_locked(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.confirm_pending_accommodation_booking_for_vendor(
  p_booking_id uuid,
  p_vendor_id uuid
)
returns integer
language sql
security definer
set search_path = pg_catalog, public
as $$
  select case when p_vendor_id is null then 0
    else public.confirm_pending_accommodation_booking_locked(p_booking_id, p_vendor_id) end;
$$;

create or replace function public.confirm_pending_accommodation_booking_as_admin(p_booking_id uuid)
returns integer
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.confirm_pending_accommodation_booking_locked(p_booking_id, null);
$$;

-- Preserve the existing service-only boundary on the replaced RPCs explicitly.
revoke all on function public.create_accommodation_booking_after_setup(
  uuid, uuid, uuid, uuid, date, date, integer, integer, integer, integer, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_accommodation_booking_after_setup(
  uuid, uuid, uuid, uuid, date, date, integer, integer, integer, integer, integer, text, timestamptz
) to service_role;
revoke all on function public.confirm_pending_accommodation_booking_for_vendor(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.confirm_pending_accommodation_booking_for_vendor(uuid, uuid) to service_role;
revoke all on function public.confirm_pending_accommodation_booking_as_admin(uuid)
from public, anon, authenticated;
grant execute on function public.confirm_pending_accommodation_booking_as_admin(uuid) to service_role;

-- A replacement payment method after exhausted settlement attempts starts a
-- fresh approval cycle. Confirmed stays already hold inventory, so this update
-- never makes their dates available between the two approval cycles.
create or replace function public.reopen_confirmed_accommodation_bookings_for_order(
  p_order_id uuid,
  p_expires_at timestamptz
)
returns setof public.accommodation_bookings
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_expires_at is null or not isfinite(p_expires_at) or p_expires_at <= now() then
    raise exception 'A future expires_at is required for payment recovery';
  end if;
  perform 1 from public.orders
  where id = p_order_id and status = 'failed' and settlement_charge_attempt_count = 2
  for update;
  if not found then
    raise exception 'Order is not eligible for payment recovery';
  end if;
  if exists (
    select 1 from public.accommodation_bookings
    where order_id = p_order_id and status = 'confirmed'
      and check_in < (now() at time zone 'UTC')::date
  ) then
    raise exception 'A stay has already started and cannot be reopened';
  end if;
  return query
    update public.accommodation_bookings
    set status = 'pending_approval', expires_at = p_expires_at
    where order_id = p_order_id and status = 'confirmed'
    returning *;
end;
$$;

revoke all on function public.reopen_confirmed_accommodation_bookings_for_order(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.reopen_confirmed_accommodation_bookings_for_order(uuid, timestamptz)
to service_role;

-- The legacy direct cancellation RPC only changes a booking status; it does
-- not synchronize an in-flight charge or refund a paid order. Keep cancellation
-- behind a future order-aware server flow rather than expose that bypass.
revoke all on function public.cancel_accommodation_booking(uuid) from public, anon, authenticated;
