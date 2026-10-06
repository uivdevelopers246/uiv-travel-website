-- Run as postgres against a migrated local database. Every fixture rolls back.
begin;
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_start date := (now() at time zone 'UTC')::date + 10;
  v_quote jsonb;
  v_booking public.accommodation_bookings;
  v_replay public.accommodation_bookings;
  v_failed boolean;
  v_calendar record;
begin
  insert into auth.users (id, email) values
    (v_owner, 'calendar-owner@example.invalid'), (v_stranger, 'calendar-stranger@example.invalid'),
    (v_admin, 'calendar-admin@example.invalid');
  insert into public.site_admins (user_id) values (v_admin);
  insert into public.vendors (id, name, owner_user_id) values (v_vendor, 'Calendar host', v_owner);
  insert into public.accommodations (id, vendor_id, name, accommodation_type, status, price_min_usd, max_guest_capacity)
    values (v_listing, v_vendor, 'Calendar stay', 'villa', 'published', 1, 4);
  insert into public.orders (id, user_id, status, currency, subtotal_cents, total_cents)
    values (v_order, v_stranger, 'awaiting_vendor_approval', 'usd', 45000, 45000);

  v_quote := public.accommodation_stay_quote(v_listing, v_start, v_start + 3);
  assert not (v_quote->>'available')::boolean, 'Unconfigured nights are closed even with listing rate';
  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  v_failed := false;
  begin
    perform public.set_accommodation_nights(v_listing, v_start, v_start + 2, true, 10000);
  exception when insufficient_privilege then v_failed := true; end;
  assert v_failed, 'Another user cannot write the host calendar';
  v_failed := false;
  begin
    perform public.get_accommodation_calendar(v_listing, v_start, v_start + 2);
  exception when insufficient_privilege then v_failed := true; end;
  assert v_failed, 'Another user cannot read the host calendar';

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_failed := false;
  begin
    perform public.set_accommodation_nights(v_listing, v_start, v_start, true, 49);
  exception when invalid_parameter_value then v_failed := true; end;
  assert v_failed, 'Open nights must meet the minimum USD charge';
  assert public.set_accommodation_nights(v_listing, v_start, v_start + 2, true, 10000) = 3,
    'The last night of a bulk range is inclusive';
  perform public.set_accommodation_nights(v_listing, v_start + 1, v_start + 2, true, 17500);
  v_quote := public.accommodation_stay_quote(v_listing, v_start, v_start + 3);
  assert (v_quote->>'available')::boolean, 'Fully open stay is available';
  assert (v_quote->>'total_cents')::integer = 45000, 'Mixed nightly prices are summed';
  assert (v_quote->>'unit_price_cents')::integer = 10000, 'Legacy unit stores minimum nightly price';
  assert jsonb_array_length(v_quote->'nightly_prices') = 3, 'Quote includes one price per booked night';
  assert not (public.accommodation_stay_quote(v_listing, v_start, v_start + 4)->>'available')::boolean,
    'One missing night makes the stay unavailable';

  perform public.set_accommodation_nights(v_listing, v_start + 1, v_start + 1, false, null);
  assert not (public.accommodation_stay_quote(v_listing, v_start, v_start + 3)->>'available')::boolean,
    'One closed night makes the stay unavailable';
  select * into v_calendar from public.get_accommodation_calendar(v_listing, v_start + 1, v_start + 1);
  assert not v_calendar.is_available and v_calendar.price_cents = 17500, 'Blocking preserves the previous nightly price';
  perform public.set_accommodation_nights(v_listing, v_start + 1, v_start + 1, true, 17500);

  v_failed := false;
  begin
    perform public.set_accommodation_nights(v_listing, v_start - 11, v_start - 11, true, 10000);
  exception when invalid_parameter_value then v_failed := true; end;
  assert v_failed, 'Cannot write past nights';
  v_failed := false;
  begin
    perform public.set_accommodation_nights(v_listing, v_start, v_start + 366, true, 10000);
  exception when invalid_parameter_value then v_failed := true; end;
  assert v_failed, 'Bulk writes have a bounded range';

  v_failed := false;
  begin
    perform public.create_accommodation_booking_after_setup(v_listing, v_stranger, v_vendor, v_order,
      v_start, v_start + 3, 2, 10000, 30000, 30000, 0, 'pending_approval', now() + interval '1 day');
  exception when raise_exception then v_failed := true; end;
  assert v_failed, 'Flat listing or minimum-rate multiplication cannot undercharge';
  select * into v_booking from public.create_accommodation_booking_after_setup(v_listing, v_stranger, v_vendor, v_order,
    v_start, v_start + 3, 2, 10000, 45000, 45000, 0, 'pending_approval', now() + interval '1 day');
  assert v_booking.total_cents = 45000, 'Booking stores the true nightly total';
  v_quote := public.accommodation_stay_quote(v_listing, v_start, v_start + 3);
  assert not (v_quote->>'available')::boolean and (v_quote->>'total_cents')::integer = 45000,
    'Pending bookings hold nights while keeping a usable price quote';
  select * into v_calendar from public.get_accommodation_calendar(v_listing, v_start, v_start);
  assert v_calendar.is_held, 'Host sees held nights without private guest data';

  v_failed := false;
  begin
    perform public.set_accommodation_nights(v_listing, v_start + 2, v_start + 3, false, null);
  exception when exclusion_violation then v_failed := true; end;
  assert v_failed, 'Blocking any held night rejects the complete range';
  assert not exists(select 1 from public.accommodation_nights where accommodation_id = v_listing and night = v_start + 3),
    'Failed range writes have no partial changes';
  v_failed := false;
  begin
    perform public.set_accommodation_nights(v_listing, v_start, v_start, true, 100);
  exception when exclusion_violation then v_failed := true; end;
  assert v_failed, 'Repricing held nights is also forbidden';
  assert public.set_accommodation_nights(v_listing, v_start + 3, v_start + 3, true, 5000) = 1,
    'Checkout night is available for the next arrival';

  -- Existing holds must replay even when a legacy reservation has no calendar.
  delete from public.accommodation_nights where accommodation_id = v_listing and night < v_start + 3;
  select * into v_replay from public.create_accommodation_booking_after_setup(v_listing, v_stranger, v_vendor, v_order,
    v_start, v_start + 3, 2, 10000, 45000, 45000, 0, 'pending_approval', now() + interval '2 days');
  assert v_replay.id = v_booking.id and v_replay.total_cents = 45000, 'Legacy live holds retain their booked totals';
  assert public.confirm_pending_accommodation_booking_for_vendor(v_booking.id, v_vendor) = 1,
    'Legacy paid terms still permit approval';
  v_failed := false;
  begin
    perform public.set_accommodation_nights(v_listing, v_start, v_start, true, 10000);
  exception when exclusion_violation then v_failed := true; end;
  assert v_failed, 'Confirmed nights also cannot be edited';
  perform public.cancel_accommodation_bookings_for_order(v_order);

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  assert public.set_accommodation_nights(v_listing, v_start, v_start, true, 10000) = 1,
    'A site admin can manage available dates after cancellation';
  assert not has_table_privilege('authenticated', 'public.accommodation_nights', 'INSERT,UPDATE,DELETE'),
    'Direct writes cannot bypass listing lock or booked-night guard';
  assert not has_function_privilege('anon', 'public.set_accommodation_nights(uuid,date,date,boolean,integer)', 'execute'),
    'Anonymous clients cannot update the calendar';
  assert has_function_privilege('anon', 'public.accommodation_stay_quote(uuid,date,date)', 'execute'),
    'Guests can request a public quote';
  raise notice 'Accommodation nightly calendar checks passed';
end;
$$;
rollback;
