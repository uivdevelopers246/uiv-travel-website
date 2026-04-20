-- Local dev seed: create a default admin + test users/vendors

create extension if not exists pgcrypto with schema extensions;

create or replace function public.seed_user(_email text, _password text)
returns uuid
language plpgsql
set search_path = auth, public
as $$
declare
  v_user_id uuid;
begin
  select id
    into v_user_id
  from auth.users
  where email = _email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      recovery_sent_at,
      email_change_token_new,
      email_change,
      email_change_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user
    )
    values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      _email,
      extensions.crypt(_password, extensions.gen_salt('bf')),
      now(),
      now(),
      '',
      now(),
      '',
      now(),
      '',
      '',
      now(),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      '{}'::jsonb,
      now(),
      now(),
      false
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(_password, extensions.gen_salt('bf')),
        email_confirmed_at = now(),
        invited_at = now(),
        confirmation_sent_at = now(),
        recovery_sent_at = now(),
        email_change_sent_at = now(),
        last_sign_in_at = now(),
        raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', _email),
    'email',
    now(),
    now(),
    now()
  )
  on conflict do nothing;

  insert into public.profiles (id, display_name, created_by, updated_by)
  values (
    v_user_id,
    split_part(_email, '@', 1),
    v_user_id,
    v_user_id
  )
  on conflict (id) do nothing;

  return v_user_id;
end;
$$;

create or replace function public.seed_activity_row(
  p_id uuid,
  p_vendor_name text,
  p_title text,
  p_description text,
  p_location text,
  p_category text,
  p_duration_hours double precision,
  p_price_per_person numeric,
  p_max_capacity integer,
  p_image_url text,
  p_status text default 'published'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id uuid;
begin
  select id into v_vendor_id
  from public.vendors
  where name = p_vendor_name;

  if v_vendor_id is null then
    raise exception 'Vendor % not found while seeding activity %', p_vendor_name, p_title;
  end if;

  insert into public.activities (
    id,
    vendor_id,
    title,
    description,
    location,
    category,
    duration_hours,
    price_per_person,
    max_capacity,
    image_url,
    status
  )
  values (
    p_id,
    v_vendor_id,
    p_title,
    p_description,
    p_location,
    p_category,
    p_duration_hours,
    p_price_per_person,
    p_max_capacity,
    p_image_url,
    p_status
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function public.seed_accommodation_row(
  p_id uuid,
  p_vendor_name text,
  p_name text,
  p_accommodation_type text,
  p_bedroom_count integer,
  p_bed_count integer,
  p_bathroom_count integer,
  p_max_guest_capacity integer,
  p_price_min_usd numeric,
  p_price_max_usd numeric,
  p_check_in_time text,
  p_check_out_time text,
  p_suitable_for_children boolean,
  p_wheelchair_accessible boolean,
  p_smoking_allowed boolean,
  p_pets_allowed boolean,
  p_beach_access_or_view boolean,
  p_transportation_provided boolean,
  p_amenities_complete boolean,
  p_amenities text[],
  p_address text,
  p_parish text,
  p_transportation_notes text,
  p_pickup_notes text,
  p_image_url text,
  p_status text default 'published'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id uuid;
begin
  select id into v_vendor_id
  from public.vendors
  where name = p_vendor_name;

  if v_vendor_id is null then
    raise exception 'Vendor % not found while seeding accommodation %', p_vendor_name, p_name;
  end if;

  insert into public.accommodations (
    id,
    vendor_id,
    name,
    accommodation_type,
    bedroom_count,
    bed_count,
    bathroom_count,
    max_guest_capacity,
    price_min_usd,
    price_max_usd,
    check_in_time,
    check_out_time,
    suitable_for_children,
    wheelchair_accessible,
    smoking_allowed,
    pets_allowed,
    beach_access_or_view,
    transportation_provided,
    amenities_complete,
    amenities,
    address,
    parish,
    transportation_notes,
    pickup_notes,
    image_url,
    status
  )
  values (
    p_id,
    v_vendor_id,
    p_name,
    p_accommodation_type,
    p_bedroom_count,
    p_bed_count,
    p_bathroom_count,
    p_max_guest_capacity,
    p_price_min_usd,
    p_price_max_usd,
    p_check_in_time,
    p_check_out_time,
    p_suitable_for_children,
    p_wheelchair_accessible,
    p_smoking_allowed,
    p_pets_allowed,
    p_beach_access_or_view,
    p_transportation_provided,
    p_amenities_complete,
    p_amenities,
    p_address,
    p_parish,
    p_transportation_notes,
    p_pickup_notes,
    p_image_url,
    p_status
  )
  on conflict (id) do nothing;
end;
$$;

do $$
declare
  v_admin_id uuid;
  v_vendor_id uuid;
begin
  v_admin_id := public.seed_user('taonichol86@gmail.com', 'Random1234');
  insert into public.site_admins (user_id)
  values (v_admin_id)
  on conflict (user_id) do nothing;

  v_vendor_id := public.seed_user('vendor1@uiv.com', 'Random1234');
  insert into public.vendors (name, owner_user_id)
  values ('Cool Comfortz Frozen Delights', v_vendor_id)
  on conflict (owner_user_id) do nothing;

  v_vendor_id := public.seed_user('vendor2@uiv.com', 'Random1234');
  insert into public.vendors (name, owner_user_id)
  values ('ECO Lifestyle & Lodge T/A Sattva Barbados SRL', v_vendor_id)
  on conflict (owner_user_id) do nothing;

  v_vendor_id := public.seed_user('vendor3@uiv.com', 'Random1234');
  insert into public.vendors (name, owner_user_id)
  values ('Cain & Son Tours', v_vendor_id)
  on conflict (owner_user_id) do nothing;

  v_vendor_id := public.seed_user('vendor4@uiv.com', 'Random1234');
  insert into public.vendors (name, owner_user_id)
  values ('TennisWithTyler', v_vendor_id)
  on conflict (owner_user_id) do nothing;

  v_vendor_id := public.seed_user('vendor5@uiv.com', 'Random1234');
  insert into public.vendors (name, owner_user_id)
  values ('CocoJetski', v_vendor_id)
  on conflict (owner_user_id) do nothing;
  

  perform public.seed_user('user1@uiv.com', 'Random1234');
  perform public.seed_user('user2@uiv.com', 'Random1234');
  perform public.seed_user('user3@uiv.com', 'Random1234');
end $$;

-- Seed activities (from vendor intake)
do $$
begin
  perform public.seed_activity_row(
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Cool Comfortz Frozen Delights',
    'The Barbados Fruit-to-Scoop Culinary Experience',
    'Culinary and Cultural | Hands-on Workshop',
    '63 Oxnards Heights, St. James',
    'culture',
    3::double precision,
    80::numeric,
    6,
    null,
    'published'
  );

  perform public.seed_activity_row(
    '11111111-1111-4111-8111-111111111112'::uuid,
    'Cain & Son Tours',
    'Cain & Son Tours',
    'Transportation services',
    'Bonnetts Road, Brittons Hill, St. Michael ',
    'adventure',
    2::double precision,
    50::numeric,
    10,
    null,
    'published'
  );
end $$;

-- Seed richer local-only mock activity listings so vendors can manage realistic
-- records through the normal UI without a separate mock data path.
do $$
begin
  perform public.seed_activity_row(
    '11111111-1111-4111-8111-111111111113'::uuid,
    'Cool Comfortz Frozen Delights',
    'Oistins Friday Food Walk',
    'Guided evening tasting tour through Oistins with local bites, grill stops, and neighborhood stories.',
    'Oistins Bay Garden, Christ Church',
    'culture',
    2.5,
    65::numeric,
    12,
    '/images/mock-data/activities/oistins-food-walk.jpg',
    'published'
  );

  perform public.seed_activity_row(
    '11111111-1111-4111-8111-111111111114'::uuid,
    'Cain & Son Tours',
    'Carlisle Bay Catamaran & Turtle Snorkel',
    'Half-day catamaran cruise with snorkel gear, calm-water turtle stops, and a relaxed onboard lunch.',
    'Carlisle Bay, Bridgetown',
    'water-sports',
    4.0,
    145::numeric,
    18,
    '/images/mock-data/activities/carlisle-bay-catamaran.jpg',
    'published'
  );

  perform public.seed_activity_row(
    '11111111-1111-4111-8111-111111111115'::uuid,
    'TennisWithTyler',
    'Bathsheba Coastline Hike',
    'Sunrise coastal hike with tidepool lookouts, breezy ridge paths, and a beachside recovery stop.',
    'Bathsheba Park, St Joseph',
    'nature',
    3.5,
    55::numeric,
    10,
    '/images/mock-data/activities/bathsheba-coastline-hike.jpg',
    'published'
  );

  perform public.seed_activity_row(
    '11111111-1111-4111-8111-111111111116'::uuid,
    'CocoJetski',
    'Barbados Wildlife Reserve Safari',
    'Guided inland reserve tour focused on green monkeys, mahogany groves, and panoramic hilltop views.',
    'Farley Hill, St Peter',
    'wildlife',
    3.0,
    70::numeric,
    14,
    '/images/mock-data/activities/wildlife-reserve-safari.jpg',
    'published'
  );
end $$;

-- ECO Lifestyle & Lodge (UnitedIV Accommodation Partner Intake Form V2): business + listing #1
update public.vendors v
set
  owner_full_name = 'Kyle Taylor',
  business_phone = '1-246-433-9450',
  personal_phone = null,
  contact_email = 'reception@ecolifestylelodge.com',
  is_incorporated = true,
  country_of_incorporation = 'Barbados',
  business_registration_number = '64091'
from auth.users u
where u.email = 'vendor2@uiv.com'
  and v.owner_user_id = u.id;

do $$
begin
  perform public.seed_accommodation_row(
    '22222222-2222-4222-8222-222222222221'::uuid,
    'ECO Lifestyle & Lodge T/A Sattva Barbados SRL',
    'ECO Lifestyle & Lodge',
    'hotel',
    10,
    11,
    10,
    21,
    340::numeric,
    415::numeric,
    '3pm',
    '11am',
    false,
    false,
    false,
    false,
    true,
    false,
    true,
    '{}'::text[],
    'Tent Bay',
    'St Joseph',
    'Additional cost',
    null,
    null,
    'published'
  );
end $$;

do $$
begin
  perform public.seed_accommodation_row(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'ECO Lifestyle & Lodge T/A Sattva Barbados SRL',
    'Bathsheba Surf Guesthouse',
    'guesthouse',
    4,
    5,
    3,
    8,
    185::numeric,
    240::numeric,
    '3pm',
    '11am',
    true,
    false,
    false,
    false,
    true,
    false,
    true,
    array['wifi', 'parking', 'beach-access', 'air-conditioning']::text[],
    'Bathsheba, St Joseph',
    'St Joseph',
    'Airport transfer can be arranged with local drivers.',
    null,
    '/images/mock-data/accommodations/bathsheba-surf-guesthouse.jpg',
    'published'
  );

  perform public.seed_accommodation_row(
    '22222222-2222-4222-8222-222222222223'::uuid,
    'Cain & Son Tours',
    'Historic Bridgetown Courtyard Hotel',
    'hotel',
    18,
    22,
    18,
    40,
    210::numeric,
    315::numeric,
    '3pm',
    '11am',
    true,
    true,
    false,
    false,
    false,
    false,
    true,
    array['wifi', 'restaurant', 'room-service', 'laundry']::text[],
    'Broad Street, Bridgetown',
    'St Michael',
    null,
    null,
    '/images/mock-data/accommodations/historic-bridgetown-courtyard-hotel.jpg',
    'published'
  );

  perform public.seed_accommodation_row(
    '22222222-2222-4222-8222-222222222224'::uuid,
    'TennisWithTyler',
    'Speightstown Seabreeze Resort',
    'resort',
    12,
    16,
    12,
    30,
    320::numeric,
    460::numeric,
    '4pm',
    '11am',
    true,
    true,
    false,
    false,
    true,
    true,
    true,
    array['wifi', 'pool', 'restaurant', 'spa', 'air-conditioning']::text[],
    'Speightstown Waterfront, St Peter',
    'St Peter',
    'Complimentary shuttle to nearby beaches and Speightstown boardwalk.',
    'Optional airport pickup available for additional charge.',
    '/images/mock-data/accommodations/speightstown-seabreeze-resort.jpg',
    'published'
  );

  perform public.seed_accommodation_row(
    '22222222-2222-4222-8222-222222222225'::uuid,
    'CocoJetski',
    'Paynes Bay Cliffside Villa',
    'villa',
    5,
    6,
    5,
    10,
    680::numeric,
    840::numeric,
    '4pm',
    '10am',
    true,
    false,
    false,
    false,
    true,
    true,
    true,
    array['wifi', 'pool', 'parking', 'kitchen', 'beach-access']::text[],
    'Paynes Bay Ridge, St James',
    'St James',
    'Private driver and watersports concierge can be arranged.',
    'Meet-and-greet check-in available with advance notice.',
    '/images/mock-data/accommodations/paynes-bay-cliffside-villa.jpg',
    'published'
  );
end $$;

-- Seed gallery images for the local dev activity listings.
insert into public.activity_images (activity_id, image_url, display_order, alt_text)
values
  ('11111111-1111-4111-8111-111111111113'::uuid, '/images/mock-data/activities/oistins-food-walk.jpg', 0::smallint, 'Street food tasting stop on the Oistins walk'),
  ('11111111-1111-4111-8111-111111111113'::uuid, '/images/mock-data/activities/oistins-food-walk-market.jpg', 1::smallint, 'Bustling Oistins market scene at dusk'),
  ('11111111-1111-4111-8111-111111111113'::uuid, '/images/mock-data/activities/oistins-food-walk-grill.jpg', 2::smallint, 'Fresh seafood grilling during the Oistins tour'),
  ('11111111-1111-4111-8111-111111111114'::uuid, '/images/mock-data/activities/carlisle-bay-catamaran.jpg', 0::smallint, 'Catamaran anchored in Carlisle Bay'),
  ('11111111-1111-4111-8111-111111111114'::uuid, '/images/mock-data/activities/carlisle-bay-catamaran-snorkel.jpg', 1::smallint, 'Snorkel stop over clear reef water'),
  ('11111111-1111-4111-8111-111111111114'::uuid, '/images/mock-data/activities/carlisle-bay-catamaran-deck.jpg', 2::smallint, 'Guests relaxing on the catamaran deck'),
  ('11111111-1111-4111-8111-111111111115'::uuid, '/images/mock-data/activities/bathsheba-coastline-hike.jpg', 0::smallint, 'Coastal trail above Bathsheba surf'),
  ('11111111-1111-4111-8111-111111111115'::uuid, '/images/mock-data/activities/bathsheba-coastline-hike-viewpoint.jpg', 1::smallint, 'Viewpoint stop overlooking Bathsheba coastline'),
  ('11111111-1111-4111-8111-111111111115'::uuid, '/images/mock-data/activities/bathsheba-coastline-hike-trail.jpg', 2::smallint, 'Rocky trail section on the hike'),
  ('11111111-1111-4111-8111-111111111116'::uuid, '/images/mock-data/activities/wildlife-reserve-safari.jpg', 0::smallint, 'Reserve entrance and safari trail'),
  ('11111111-1111-4111-8111-111111111116'::uuid, '/images/mock-data/activities/wildlife-reserve-safari-trail.jpg', 1::smallint, 'Shaded safari path through the reserve'),
  ('11111111-1111-4111-8111-111111111116'::uuid, '/images/mock-data/activities/wildlife-reserve-safari-monkeys.jpg', 2::smallint, 'Green monkeys spotted on the reserve tour')
on conflict (activity_id, display_order) do nothing;

-- Seed gallery images for the local dev accommodation listings.
insert into public.accommodation_images (
  accommodation_id,
  image_url,
  display_order,
  alt_text
)
values
  ('22222222-2222-4222-8222-222222222222'::uuid, '/images/mock-data/accommodations/bathsheba-surf-guesthouse.jpg', 0::smallint, 'Exterior of the Bathsheba surf guesthouse'),
  ('22222222-2222-4222-8222-222222222222'::uuid, '/images/mock-data/accommodations/bathsheba-surf-guesthouse-room.jpg', 1::smallint, 'Guest room with ocean-inspired decor'),
  ('22222222-2222-4222-8222-222222222222'::uuid, '/images/mock-data/accommodations/bathsheba-surf-guesthouse-deck.jpg', 2::smallint, 'Shared deck overlooking the coastline'),
  ('22222222-2222-4222-8222-222222222223'::uuid, '/images/mock-data/accommodations/historic-bridgetown-courtyard-hotel.jpg', 0::smallint, 'Courtyard facade in central Bridgetown'),
  ('22222222-2222-4222-8222-222222222223'::uuid, '/images/mock-data/accommodations/historic-bridgetown-courtyard-hotel-room.jpg', 1::smallint, 'Refreshed king room at the courtyard hotel'),
  ('22222222-2222-4222-8222-222222222223'::uuid, '/images/mock-data/accommodations/historic-bridgetown-courtyard-hotel-lobby.jpg', 2::smallint, 'Lobby lounge with heritage details'),
  ('22222222-2222-4222-8222-222222222224'::uuid, '/images/mock-data/accommodations/speightstown-seabreeze-resort.jpg', 0::smallint, 'Resort exterior near the Speightstown waterfront'),
  ('22222222-2222-4222-8222-222222222224'::uuid, '/images/mock-data/accommodations/speightstown-seabreeze-resort-suite.jpg', 1::smallint, 'Suite interior with seating area'),
  ('22222222-2222-4222-8222-222222222224'::uuid, '/images/mock-data/accommodations/speightstown-seabreeze-resort-pool.jpg', 2::smallint, 'Pool terrace at the resort'),
  ('22222222-2222-4222-8222-222222222225'::uuid, '/images/mock-data/accommodations/paynes-bay-cliffside-villa.jpg', 0::smallint, 'Cliffside villa exterior near Paynes Bay'),
  ('22222222-2222-4222-8222-222222222225'::uuid, '/images/mock-data/accommodations/paynes-bay-cliffside-villa-pool.jpg', 1::smallint, 'Infinity pool overlooking the west coast'),
  ('22222222-2222-4222-8222-222222222225'::uuid, '/images/mock-data/accommodations/paynes-bay-cliffside-villa-bedroom.jpg', 2::smallint, 'Primary bedroom with indoor-outdoor feel')
on conflict (accommodation_id, display_order) do nothing;

-- Set listing coordinates once so seeded records appear on map-based experiences.
do $$
begin
  update public.activities
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.6298, 13.1809), 4326)
  where id = '11111111-1111-4111-8111-111111111111'::uuid;

  update public.activities
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.6039, 13.0894), 4326)
  where id = '11111111-1111-4111-8111-111111111112'::uuid;

  update public.activities
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.5335, 13.0706), 4326)
  where id = '11111111-1111-4111-8111-111111111113'::uuid;

  update public.activities
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.6221, 13.0978), 4326)
  where id = '11111111-1111-4111-8111-111111111114'::uuid;

  update public.activities
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.5257, 13.2114), 4326)
  where id = '11111111-1111-4111-8111-111111111115'::uuid;

  update public.activities
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.5758, 13.2652), 4326)
  where id = '11111111-1111-4111-8111-111111111116'::uuid;

  update public.accommodations
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.5186, 13.2143), 4326)
  where id = '22222222-2222-4222-8222-222222222221'::uuid;

  update public.accommodations
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.5252, 13.2119), 4326)
  where id = '22222222-2222-4222-8222-222222222222'::uuid;

  update public.accommodations
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.6148, 13.0971), 4326)
  where id = '22222222-2222-4222-8222-222222222223'::uuid;

  update public.accommodations
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.6489, 13.2517), 4326)
  where id = '22222222-2222-4222-8222-222222222224'::uuid;

  update public.accommodations
    set location_point = extensions.st_setsrid(extensions.st_makepoint(-59.6391, 13.1538), 4326)
  where id = '22222222-2222-4222-8222-222222222225'::uuid;
end $$;

drop function public.seed_user(text, text);
