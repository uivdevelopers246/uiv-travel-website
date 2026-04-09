alter table public.activities
  add column if not exists latitude double precision
  generated always as (extensions.st_y(location_point::extensions.geometry)) stored,
  add column if not exists longitude double precision
  generated always as (extensions.st_x(location_point::extensions.geometry)) stored;

comment on column public.activities.latitude is
  'Derived latitude (WGS84) from location_point; read-only.';

comment on column public.activities.longitude is
  'Derived longitude (WGS84) from location_point; read-only.';

alter table public.accommodations
  add column if not exists latitude double precision
  generated always as (extensions.st_y(location_point::extensions.geometry)) stored,
  add column if not exists longitude double precision
  generated always as (extensions.st_x(location_point::extensions.geometry)) stored;

comment on column public.accommodations.latitude is
  'Derived latitude (WGS84) from location_point; read-only.';

comment on column public.accommodations.longitude is
  'Derived longitude (WGS84) from location_point; read-only.';
