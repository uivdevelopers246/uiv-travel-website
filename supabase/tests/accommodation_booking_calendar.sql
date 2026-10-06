-- Run as postgres against a migrated local database. Every fixture rolls back.
begin;
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_empty uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_today date := (now() at time zone 'UTC')::date;
  v_prices integer[];
  v_count integer;
  v_quote jsonb;
begin
  insert into auth.users (id, email) values
    (v_owner, 'calendar-owner@example.invalid'), (v_guest, 'calendar-guest@example.invalid');
  insert into public.vendors (id, name, owner_user_id) values (v_vendor, 'Calendar host', v_owner);
  insert into public.accommodations (id, vendor_id, name, accommodation_type, status)
    values (v_listing, v_vendor, 'Calendar stay', 'villa', 'published'),
      (v_empty, v_vendor, 'No priced nights', 'villa', 'published'),
      (v_draft, v_vendor, 'Private stay', 'villa', 'draft');
  insert into public.accommodation_nights (accommodation_id, night, price_cents, is_available)
    values (v_listing, v_today - 1, 10000, true),
      (v_listing, v_today, 12550, true), (v_listing, v_today + 1, 20000, true),
      (v_listing, v_today + 2, null, false),
      (v_listing, v_today + 4, 25000, false),
      (v_listing, v_today + 5, 30000, true),
      (v_listing, v_today + 6, 30000, true),
      (v_listing, v_today + 7, 30000, true),
      (v_listing, v_today + 8, 40000, true),
      (v_draft, v_today, 15000, true);
  insert into public.accommodation_bookings
    (accommodation_id, user_id, vendor_id, check_in, check_out, guests, status, expires_at,
      unit_price_cents, subtotal_cents, total_cents)
    values (v_listing, v_guest, v_vendor, v_today + 5, v_today + 6, 1, 'confirmed', null, 30000, 30000, 30000),
      (v_listing, v_guest, v_vendor, v_today + 6, v_today + 7, 1, 'pending_approval', now() + interval '1 hour', 30000, 30000, 30000),
      (v_listing, v_guest, v_vendor, v_today + 7, v_today + 8, 1, 'pending_approval', now() - interval '1 second', 30000, 30000, 30000),
      (v_listing, v_guest, v_vendor, v_today + 8, v_today + 9, 1, 'cancelled', null, 40000, 40000, 40000);

  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select array_agg(price_cents order by night), count(*) into v_prices, v_count
    from public.accommodation_booking_calendar(v_listing, v_today - 1, v_today + 8);
  assert v_count = 10, 'The calendar includes every requested day in order';
  assert v_prices = array[null, 12550, 20000, null, null, null, null, null, 30000, 40000],
    'Past, unpriced, unconfigured, blocked and held nights have no public price; expired holds and cancelled bookings are released';
  select count(*) into v_count from public.accommodation_booking_calendar(v_empty, v_today, v_today + 30)
    where price_cents is null;
  assert v_count = 31, 'An empty published listing still has a complete unavailable calendar';
  v_quote := public.accommodation_stay_quote(v_listing, v_today, v_today + 2);
  assert (v_quote->>'available')::boolean and (v_quote->>'total_cents')::integer = 32550,
    'Guests can check out on the first unavailable night without paying for it';
  select count(*) into v_count from public.accommodation_booking_calendar(v_draft, v_today, v_today + 1);
  assert v_count = 0, 'Anonymous readers cannot see private listing prices';
  select count(*) into v_count from public.accommodation_booking_calendar(gen_random_uuid(), v_today, v_today + 1);
  assert v_count = 0, 'Missing listings return no rows';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  select count(*) into v_count from public.accommodation_booking_calendar(v_draft, v_today, v_today + 1);
  assert v_count = 0, 'The public booking calendar never opens draft inventory, even for its owner';
  update public.accommodations set status = 'archived' where id = v_draft;
  select count(*) into v_count from public.accommodation_booking_calendar(v_draft, v_today, v_today + 1);
  assert v_count = 0, 'Archived inventory is also private';

  begin
    perform * from public.accommodation_booking_calendar(v_listing, v_today, v_today + 366);
    raise exception 'Expected excessive range rejection';
  exception when sqlstate '22023' then null; end;
  begin
    perform * from public.accommodation_booking_calendar(v_listing, v_today + 1, v_today);
    raise exception 'Expected reversed range rejection';
  exception when sqlstate '22023' then null; end;
  begin
    perform * from public.accommodation_booking_calendar(v_listing, null, v_today);
    raise exception 'Expected missing date rejection';
  exception when sqlstate '22023' then null; end;
  begin
    perform * from public.accommodation_booking_calendar(v_listing, v_today, 'infinity'::date);
    raise exception 'Expected non-finite date rejection';
  exception when sqlstate '22023' then null; end;
  assert has_function_privilege('anon', 'public.accommodation_booking_calendar(uuid,date,date)', 'execute'),
    'Guests can read the public calendar without signing in';
  assert not has_table_privilege('anon', 'public.accommodation_nights', 'select'),
    'Public calendar access does not grant direct access to host calendar data';
  raise notice 'Accommodation booking calendar checks passed';
end;
$$;
rollback;
