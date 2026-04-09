-- Add spatial point and geocoding metadata to activities for map pins,
-- "near me" queries, and handling approximate vs precise locations.


-- 1) Point for map pins and distance queries (WGS84)
alter table public.activities
  add column if not exists location_point extensions.geometry(Point, 4326);

comment on column public.activities.location_point is
  'Geographic point (WGS84) for map pins and distance queries; from geocoding or pin-drop.';

-- 2) Geocoding result quality: use to show "Approximate location" or require review
alter table public.activities
  add column if not exists geocode_accuracy text;

comment on column public.activities.geocode_accuracy is
  'Mapbox place_type (or normalized): address/poi = precise; street/neighborhood/locality = approximate; place/region/country or null = no pin or needs review.';

alter table public.activities
  add constraint activities_geocode_accuracy_check
  check (geocode_accuracy is null or geocode_accuracy in (
    'address', 'poi', 'street', 'neighborhood', 'locality', 'place', 'region', 'country'
  ));

-- 3) Mapbox feature id for re-geocoding and debugging
alter table public.activities
  add column if not exists geocode_feature_id text;

comment on column public.activities.geocode_feature_id is
  'Mapbox feature id of the chosen geocode result; useful for re-geocoding and support.';

-- 4) Formatted place name from geocoder (audit / display)
alter table public.activities
  add column if not exists geocode_label text;

comment on column public.activities.geocode_label is
  'Formatted place name from Mapbox (e.g. label / place_name); for display or audit.';

-- GIST index for fast "near me" and map queries
create index if not exists idx_activities_location_point
  on public.activities
  using gist (location_point);
