-- Add spatial point and minimal quality flag for map pins and "near me".
-- Add spatial point and minimal quality flag for map pins and "near me".
-- PostGIS already enabled (see 20251227203101_remote_schema.sql).

alter table public.activities
  add column if not exists location_point geometry(Point, 4326);

comment on column public.activities.location_point is
  'Geographic point (WGS84) for map pins and distance; from Mapbox center.';

alter table public.activities
  add column if not exists location_quality text
  check (location_quality is null or location_quality in ('precise', 'approx'));

comment on column public.activities.location_quality is
  'precise = address/poi; approx = street/neighborhood/locality; null = no pin.';

create index if not exists idx_activities_location_point
  on public.activities using gist (location_point);