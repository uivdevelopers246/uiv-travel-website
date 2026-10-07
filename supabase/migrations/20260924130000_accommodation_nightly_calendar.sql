-- Unconfigured nights are closed. All inventory changes serialize on the listing
-- row, the same lock used by booking creation and approval.
create table public.accommodation_nights (
  accommodation_id uuid not null references public.accommodations(id) on delete cascade,
  night date not null check (isfinite(night)),
  price_cents integer check (price_cents >= 0),
  is_available boolean not null default false,
  primary key (accommodation_id, night),
  check (not is_available or (price_cents is not null and price_cents >= 50))
);
alter table public.accommodation_nights enable row level security;
revoke all on public.accommodation_nights from anon, authenticated;
grant select on public.accommodation_nights to authenticated;
grant all on public.accommodation_nights to service_role;
create policy "Owners may read their accommodation nights"
on public.accommodation_nights for select to authenticated
using (exists (select 1 from public.accommodations a where a.id = accommodation_id
  and (public.is_vendor_owner(a.vendor_id) or public.is_site_admin())));

create or replace function public.set_accommodation_nights(
  p_accommodation_id uuid, p_first_night date, p_last_night date,
  p_is_available boolean, p_price_cents integer default null
)
returns integer
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_vendor_id uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_first_night is null or p_last_night is null or not isfinite(p_first_night)
    or not isfinite(p_last_night) or p_last_night < p_first_night
    or p_last_night - p_first_night >= 366
    or p_first_night < (now() at time zone 'UTC')::date
    or p_is_available is null or p_price_cents < 0
    or (p_is_available and (p_price_cents is null or p_price_cents < 50)) then
    raise exception 'Invalid calendar dates or nightly price' using errcode = '22023';
  end if;
  select vendor_id into v_vendor_id from public.accommodations where id = p_accommodation_id for update;
  if not found then raise exception 'Accommodation not found' using errcode = 'P0002'; end if;
  if not (public.is_vendor_owner(v_vendor_id) or public.is_site_admin()) then
    raise exception 'Not accommodation owner' using errcode = '42501';
  end if;
  if public.accommodation_stay_is_held(p_accommodation_id, p_first_night, p_last_night + 1) then
    raise exception 'Selected nights have a booking or pending request' using errcode = '23P01';
  end if;
  insert into public.accommodation_nights as existing (accommodation_id, night, price_cents, is_available)
    select p_accommodation_id, p_first_night + offset_day, p_price_cents, p_is_available
    from generate_series(0, p_last_night - p_first_night) as offset_day
  on conflict (accommodation_id, night) do update
    set is_available = excluded.is_available,
        price_cents = coalesce(excluded.price_cents, existing.price_cents);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_accommodation_calendar(
  p_accommodation_id uuid, p_first_night date, p_last_night date
)
returns table (night date, price_cents integer, is_available boolean, is_held boolean)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_vendor_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_first_night is null or p_last_night is null or not isfinite(p_first_night)
    or not isfinite(p_last_night) or p_last_night < p_first_night
    or p_last_night - p_first_night >= 366 then
    raise exception 'Invalid calendar range' using errcode = '22023';
  end if;
  select vendor_id into v_vendor_id from public.accommodations where id = p_accommodation_id;
  if not found then raise exception 'Accommodation not found' using errcode = 'P0002'; end if;
  if not (public.is_vendor_owner(v_vendor_id) or public.is_site_admin()) then
    raise exception 'Not accommodation owner' using errcode = '42501';
  end if;
  return query select p_first_night + offset_day, n.price_cents,
    coalesce(n.is_available, false),
    public.accommodation_stay_is_held(p_accommodation_id, p_first_night + offset_day, p_first_night + offset_day + 1)
  from generate_series(0, p_last_night - p_first_night) as offset_day
  left join public.accommodation_nights n
    on n.accommodation_id = p_accommodation_id and n.night = p_first_night + offset_day
  order by offset_day;
end;
$$;

-- Returns prices only for a complete, open stay on a published property. No
-- customer or booking identifiers cross this public quote boundary.
create or replace function public.accommodation_stay_quote(
  p_accommodation_id uuid, p_check_in date, p_check_out date
)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare
  v_nights integer;
  v_count integer;
  v_min integer;
  v_total bigint;
  v_prices jsonb;
  v_empty jsonb;
begin
  if p_check_in is null or p_check_out is null or not isfinite(p_check_in)
    or not isfinite(p_check_out) or p_check_out <= p_check_in
    or p_check_out - p_check_in > 366 then
    raise exception 'Invalid stay dates' using errcode = '22023';
  end if;
  v_nights := p_check_out - p_check_in;
  v_empty := jsonb_build_object('available', false, 'nights', v_nights,
    'unit_price_cents', 0, 'total_cents', 0, 'currency', 'usd', 'nightly_prices', '[]'::jsonb);
  if p_check_in < (now() at time zone 'UTC')::date or not exists (
    select 1 from public.accommodations where id = p_accommodation_id and status = 'published'
  ) then return v_empty; end if;
  select count(*), min(n.price_cents), sum(n.price_cents),
    jsonb_agg(jsonb_build_object('night', n.night, 'price_cents', n.price_cents) order by n.night)
  into v_count, v_min, v_total, v_prices
  from public.accommodation_nights n
  where n.accommodation_id = p_accommodation_id and n.night >= p_check_in and n.night < p_check_out
    and n.is_available and n.price_cents is not null;
  if v_count <> v_nights or v_total > 2147483647 then return v_empty; end if;
  return jsonb_build_object('available', not public.accommodation_stay_is_held(p_accommodation_id, p_check_in, p_check_out),
    'nights', v_nights, 'unit_price_cents', v_min, 'total_cents', v_total,
    'currency', 'usd', 'nightly_prices', v_prices);
end;
$$;

revoke all on function public.set_accommodation_nights(uuid, date, date, boolean, integer) from public, anon;
grant execute on function public.set_accommodation_nights(uuid, date, date, boolean, integer) to authenticated;
revoke all on function public.get_accommodation_calendar(uuid, date, date) from public, anon;
grant execute on function public.get_accommodation_calendar(uuid, date, date) to authenticated;
revoke all on function public.accommodation_stay_quote(uuid, date, date) from public;
grant execute on function public.accommodation_stay_quote(uuid, date, date) to anon, authenticated, service_role;

-- Preserve existing live holds before consulting changed calendar prices.
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
  v_quote jsonb;
begin
  if p_check_in is null or p_check_out is null or not isfinite(p_check_in)
    or not isfinite(p_check_out) or p_check_out <= p_check_in
    or p_check_out - p_check_in > 366 then
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
  v_quote := public.accommodation_stay_quote(p_accommodation_id, p_check_in, p_check_out);
  if not (v_quote->>'available')::boolean then
    raise exception 'Stay dates are unavailable or overlap an existing booking';
  end if;
  v_unit_price := (v_quote->>'unit_price_cents')::integer;
  v_subtotal := (v_quote->>'total_cents')::integer;
  -- No discounts are offered for stays yet. Do not trust writable cart snapshots.
  if p_unit_price_cents is distinct from v_unit_price
    or p_subtotal_cents is distinct from v_subtotal
    or p_discount_cents is distinct from 0
    or p_total_cents is distinct from v_subtotal then
    raise exception 'Accommodation price changed; refresh the cart before checkout';
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
