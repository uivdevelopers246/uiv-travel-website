-- Run with psql -v ON_ERROR_STOP=1 against a local migrated database as postgres.
-- Fixtures and all changes are rolled back. No pgTAP extension is required.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_other_order uuid := gen_random_uuid();
  v_booking public.accommodation_bookings;
  v_replay public.accommodation_bookings;
  v_later_booking public.accommodation_bookings;
  v_start date := (now() at time zone 'UTC')::date + 10;
  v_failed boolean;
begin
  insert into auth.users (id, email) values (v_user, 'accommodation-test@example.invalid');
  insert into public.vendors (id, name, owner_user_id) values (v_vendor, 'Test property', v_user);
  insert into public.accommodations (id, vendor_id, name, accommodation_type, status, price_min_usd, max_guest_capacity)
  values (v_listing, v_vendor, 'Test stay', 'villa', 'published', 125.50, 4);
  -- Open nights explicitly; the listing's display price is never inventory.
  insert into public.accommodation_nights (accommodation_id, night, price_cents, is_available)
  select v_listing, v_start + day_offset, 12550, true from generate_series(0, 10) day_offset;
  insert into public.orders (id, user_id, status, currency, subtotal_cents, total_cents)
  values (v_order, v_user, 'awaiting_vendor_approval', 'usd', 37650, 37650),
    (v_other_order, v_user, 'awaiting_vendor_approval', 'usd', 37650, 37650);

  -- The setup handler may never create an already-confirmed, unpaid reservation.
  v_failed := false;
  begin
    perform public.create_accommodation_booking_after_setup(v_listing, v_user, v_vendor, v_order,
      v_start, v_start + 3, 2, 12550, 37650, 37650, 0, 'confirmed', null);
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, 'Setup must require vendor approval';

  v_failed := false;
  begin
    perform public.create_accommodation_booking_after_setup(v_listing, v_user, v_vendor, v_order,
      v_start, v_start + 3, 2, 1, 3, 3, 0, 'pending_approval', now() + interval '1 day');
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, 'Tampered cart prices must fail';

  v_failed := false;
  begin
    perform public.create_accommodation_booking_after_setup(v_listing, v_user, v_vendor, v_order,
      v_start, v_start + 3, 5, 12550, 37650, 37650, 0, 'pending_approval', now() + interval '1 day');
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, 'Guest capacity must be enforced';

  v_failed := false;
  begin
    perform public.create_accommodation_booking_after_setup(v_listing, gen_random_uuid(), v_vendor, v_order,
      v_start, v_start + 3, 2, 12550, 37650, 37650, 0, 'pending_approval', now() + interval '1 day');
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, 'Order ownership must be enforced';

  select * into v_booking from public.create_accommodation_booking_after_setup(
    v_listing, v_user, v_vendor, v_order, v_start, v_start + 3, 2, 12550, 37650, 37650,
    0, 'pending_approval', now() + interval '1 day');
  assert v_booking.status = 'pending_approval', 'Setup creates a pending hold';
  assert public.accommodation_stay_is_held(v_listing, v_start, v_start + 1), 'Pending hold reserves inventory';
  assert not public.accommodation_stay_is_held(v_listing, v_start + 3, v_start + 4), 'Checkout date is exclusive';

  select * into v_replay from public.create_accommodation_booking_after_setup(
    v_listing, v_user, v_vendor, v_order, v_start, v_start + 3, 2, 12550, 37650, 37650,
    0, 'pending_approval', now() + interval '2 days');
  assert v_replay.id = v_booking.id, 'Setup replay returns the existing booking';
  assert v_replay.expires_at = v_booking.expires_at, 'Replay never extends approval SLA';

  v_failed := false;
  begin
    perform public.create_accommodation_booking_after_setup(v_listing, v_user, v_vendor, v_other_order,
      v_start + 1, v_start + 4, 2, 12550, 37650, 37650, 0, 'pending_approval', now() + interval '1 day');
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, 'Overlapping requests must fail';

  assert public.confirm_pending_accommodation_booking_for_vendor(v_booking.id, gen_random_uuid()) = 0,
    'Another vendor must not approve the stay';
  assert public.confirm_pending_accommodation_booking_for_vendor(v_booking.id, null) = 0,
    'Missing vendor identity must not approve the stay';
  assert public.confirm_pending_accommodation_booking_for_vendor(v_booking.id, v_vendor) = 1,
    'The owning vendor may approve an active hold';
  assert public.confirm_pending_accommodation_booking_as_admin(v_booking.id) = 0,
    'A confirmed booking cannot be approved twice';
  perform public.cancel_accommodation_bookings_for_order(v_order);
  assert not public.accommodation_stay_is_held(v_listing, v_start, v_start + 1),
    'Cancelling releases inventory';

  -- Critical regression: an expired pending row must not be resurrected after
  -- its dates have been rebooked, even before the expiry cron has swept it.
  select * into v_booking from public.create_accommodation_booking_after_setup(
    v_listing, v_user, v_vendor, v_order, v_start, v_start + 3, 2, 12550, 37650, 37650,
    0, 'pending_approval', now() + interval '1 day');
  update public.accommodation_bookings set expires_at = now() - interval '1 minute' where id = v_booking.id;
  assert not public.accommodation_stay_is_held(v_listing, v_start, v_start + 3),
    'Expired pending holds do not reserve inventory';
  select * into v_later_booking from public.create_accommodation_booking_after_setup(
    v_listing, v_user, v_vendor, v_other_order, v_start, v_start + 3, 2, 12550, 37650, 37650,
    0, 'pending_approval', now() + interval '1 day');
  assert public.confirm_pending_accommodation_booking_as_admin(v_booking.id) = 0,
    'Admin must not resurrect an expired hold';
  assert public.confirm_pending_accommodation_booking_for_vendor(v_booking.id, v_vendor) = 0,
    'Vendor must not resurrect an expired hold';
  -- Simulate a legacy overlapping pending row; approval still rechecks inventory.
  update public.accommodation_bookings set expires_at = now() + interval '1 day' where id = v_booking.id;
  assert public.confirm_pending_accommodation_booking_as_admin(v_booking.id) = 0,
    'Approval rechecks overlapping live bookings';
  update public.accommodation_bookings set expires_at = now() - interval '1 minute' where id = v_booking.id;
  assert public.confirm_pending_accommodation_booking_as_admin(v_later_booking.id) = 1,
    'Admin can approve the active replacement hold';

  v_failed := false;
  begin
    perform public.reopen_confirmed_accommodation_bookings_for_order(v_other_order, now() + interval '1 day');
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, 'A successful or pending order cannot enter payment recovery';
  update public.orders set status = 'failed', settlement_charge_attempt_count = 2 where id = v_other_order;
  select * into v_replay from public.reopen_confirmed_accommodation_bookings_for_order(
    v_other_order, now() + interval '2 days');
  assert v_replay.id = v_later_booking.id and v_replay.status = 'pending_approval',
    'Failed settlement recovery requires a fresh vendor approval';
  assert public.accommodation_stay_is_held(v_listing, v_start, v_start + 3),
    'Payment recovery retains the reserved inventory';

  assert not has_function_privilege('authenticated',
    'public.create_accommodation_booking_after_setup(uuid,uuid,uuid,uuid,date,date,integer,integer,integer,integer,integer,text,timestamptz)', 'execute'),
    'Customers cannot directly create a booking';
  assert not has_function_privilege('authenticated',
    'public.confirm_pending_accommodation_booking_for_vendor(uuid,uuid)', 'execute'),
    'Customers cannot directly approve a booking';
  assert not has_function_privilege('authenticated',
    'public.cancel_accommodation_booking(uuid)', 'execute'),
    'Customers cannot cancel a paid booking outside an order-aware refund flow';
  assert not has_function_privilege('service_role',
    'public.confirm_pending_accommodation_booking_locked(uuid,uuid)', 'execute'),
    'The shared implementation is private';
  raise notice 'Accommodation booking inventory checks passed';
end;
$$;
rollback;
