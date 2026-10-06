-- Run as postgres against a migrated local database. Every fixture rolls back.
begin;
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_empty uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_archived uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
  v_today date := (now() at time zone 'UTC')::date;
  v_range record;
  v_count integer;
begin
  insert into auth.users (id, email) values
    (v_owner, 'range-owner@example.invalid'), (v_guest, 'range-guest@example.invalid'),
    (v_admin, 'range-admin@example.invalid');
  insert into public.site_admins (user_id) values (v_admin);
  insert into public.vendors (id, name, owner_user_id) values (v_vendor, 'Range host', v_owner);
  insert into public.accommodations (id, vendor_id, name, accommodation_type, status, price_min_usd, price_max_usd)
    values (v_listing, v_vendor, 'Range stay', 'villa', 'published', 1, 9999),
      (v_empty, v_vendor, 'No calendar', 'villa', 'published', 5, 5000),
      (v_draft, v_vendor, 'Draft stay', 'villa', 'draft', 1, 9999),
      (v_archived, v_vendor, 'Archived stay', 'villa', 'archived', 1, 9999);
  insert into public.accommodation_nights (accommodation_id, night, price_cents, is_available)
    values (v_listing, v_today - 1, 50, true),
      (v_listing, v_today, 12345, true),
      (v_listing, v_today + 1, 20000, true),
      (v_listing, v_today + 8, 90000, false),
      (v_listing, v_today + 9, null, false),
      (v_draft, v_today, 11000, true),
      (v_archived, v_today, 22000, true);

  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select * into v_range from public.accommodation_bookable_price_ranges(array[v_listing]);
  assert v_range.price_min_usd = 123.45 and v_range.price_max_usd = 200,
    'Range uses current and future open nights, preserves cents, and ignores legacy, past and closed prices';
  select * into v_range from public.accommodation_bookable_price_ranges(array[v_empty]);
  assert v_range.accommodation_id = v_empty and v_range.price_min_usd is null and v_range.price_max_usd is null,
    'An existing property without bookable nights returns null prices';
  select count(*) into v_count from public.accommodation_bookable_price_ranges(array[v_listing, v_listing, v_empty, gen_random_uuid()]);
  assert v_count = 2, 'Batch returns one row per visible existing listing';
  select count(*) into v_count from public.accommodation_bookable_price_ranges('{}'::uuid[]);
  assert v_count = 0, 'Empty requests have no rows';

  insert into public.accommodation_nights (accommodation_id, night, price_cents, is_available)
    values (v_listing, v_today + 2, 9900, true),
      (v_listing, v_today + 3, 50000, true),
      (v_listing, v_today + 4, 99900, true),
      (v_listing, v_today + 5, 25000, true),
      (v_listing, v_today + 6, 30000, true),
      (v_listing, v_today + 7, 40000, true);
  insert into public.accommodation_bookings
    (accommodation_id, user_id, vendor_id, check_in, check_out, guests, status, expires_at,
      unit_price_cents, subtotal_cents, total_cents)
    values (v_listing, v_guest, v_vendor, v_today, v_today + 2, 1, 'confirmed', null, 12345, 32345, 32345),
      (v_listing, v_guest, v_vendor, v_today + 4, v_today + 5, 1, 'pending_approval', null, 99900, 99900, 99900),
      (v_listing, v_guest, v_vendor, v_today + 5, v_today + 6, 1, 'pending_approval', now() - interval '1 second', 25000, 25000, 25000),
      (v_listing, v_guest, v_vendor, v_today + 6, v_today + 7, 1, 'declined', null, 30000, 30000, 30000),
      (v_listing, v_guest, v_vendor, v_today + 7, v_today + 8, 1, 'cancelled', null, 40000, 40000, 40000);
  insert into public.accommodation_bookings
    (id, accommodation_id, user_id, vendor_id, check_in, check_out, guests, status, expires_at,
      unit_price_cents, subtotal_cents, total_cents)
    values (v_pending, v_listing, v_guest, v_vendor, v_today + 3, v_today + 4, 1,
      'pending_approval', now() + interval '1 hour', 50000, 50000, 50000);
  select * into v_range from public.accommodation_bookable_price_ranges(array[v_listing]);
  assert v_range.price_min_usd = 99 and v_range.price_max_usd = 400,
    'Confirmed and live or null-expiry pending holds are excluded; checkout night and cancelled bookings are available';
  update public.accommodation_nights set is_available = false where accommodation_id = v_listing and night >= v_today + 6;
  select * into v_range from public.accommodation_bookable_price_ranges(array[v_listing]);
  assert v_range.price_min_usd = 99 and v_range.price_max_usd = 250,
    'An expired pending hold releases its nightly price without a cleanup job';
  update public.accommodation_bookings set expires_at = now() - interval '1 second' where id = v_pending;
  select * into v_range from public.accommodation_bookable_price_ranges(array[v_listing]);
  assert v_range.price_max_usd = 500, 'The next read reflects an expired hold without changing the calendar';
  update public.accommodation_nights set is_available = false where accommodation_id = v_listing;
  select * into v_range from public.accommodation_bookable_price_ranges(array[v_listing]);
  assert v_range.price_min_usd is null and v_range.price_max_usd is null, 'Closing all nights clears the displayed range';

  select count(*) into v_count from public.accommodation_bookable_price_ranges(array[v_draft, v_archived]);
  assert v_count = 0, 'Anonymous requests cannot see draft or archived price ranges';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_guest::text, true);
  select count(*) into v_count from public.accommodation_bookable_price_ranges(array[v_draft, v_archived]);
  assert v_count = 0, 'Other users cannot see private listings';
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  select count(*) into v_count from public.accommodation_bookable_price_ranges(array[v_draft, v_archived]);
  assert v_count = 2, 'Owners can preview the range on their draft and archived listings';
  select * into v_range from public.accommodation_bookable_price_ranges(array[v_draft]);
  assert v_range.price_min_usd = 110 and v_range.price_max_usd = 110, 'A single nightly price has an equal minimum and maximum';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  select count(*) into v_count from public.accommodation_bookable_price_ranges(array[v_draft, v_archived]);
  assert v_count = 2, 'Admins can preview private listings';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select count(*) into v_count from public.accommodation_bookable_price_ranges(array[v_draft, v_archived]);
  assert v_count = 2, 'Service-role reads work without an auth user';

  assert not has_column_privilege('authenticated', 'public.accommodations', 'price_min_usd', 'INSERT,UPDATE')
    and not has_column_privilege('authenticated', 'public.accommodations', 'price_max_usd', 'INSERT,UPDATE'),
    'Clients cannot override derived prices through legacy columns';
  assert has_column_privilege('authenticated', 'public.accommodations', 'name', 'INSERT,UPDATE'),
    'Normal listing writes retain their existing grants';
  assert has_function_privilege('anon', 'public.accommodation_bookable_price_ranges(uuid[])', 'execute'),
    'Public listing readers can request calendar price ranges';
  raise notice 'Accommodation bookable price range checks passed';
end;
$$;
rollback;
