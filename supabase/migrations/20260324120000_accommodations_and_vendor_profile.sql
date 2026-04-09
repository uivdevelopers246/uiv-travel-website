-- Vendor profile fields (intake form) + accommodations listings (parity with activities).

-- -----------------------------------------------------------------------------
-- Vendors: nullable business profile columns
-- -----------------------------------------------------------------------------

alter table public.vendors
  add column if not exists owner_full_name text;

alter table public.vendors
  add column if not exists business_phone text;

alter table public.vendors
  add column if not exists personal_phone text;

alter table public.vendors
  add column if not exists contact_email text;

alter table public.vendors
  add column if not exists is_incorporated boolean;

alter table public.vendors
  add column if not exists country_of_incorporation text;

alter table public.vendors
  add column if not exists business_registration_number text;

comment on column public.vendors.owner_full_name is 'Owner full name (business intake).';
comment on column public.vendors.business_phone is 'Business phone (intake).';
comment on column public.vendors.personal_phone is 'Personal phone (optional).';
comment on column public.vendors.contact_email is 'Business contact email (optional; may differ from auth email).';
comment on column public.vendors.is_incorporated is 'Whether the business is incorporated.';
comment on column public.vendors.country_of_incorporation is 'Country of incorporation.';
comment on column public.vendors.business_registration_number is 'Business / company registration number.';

-- -----------------------------------------------------------------------------
-- Accommodations table
-- -----------------------------------------------------------------------------

create table public.accommodations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,

  name text not null,
  accommodation_type text not null,

  bedroom_count integer
    check (bedroom_count is null or bedroom_count >= 0),
  bed_count integer
    check (bed_count is null or bed_count >= 0),
  bathroom_count integer
    check (bathroom_count is null or bathroom_count >= 0),
  max_guest_capacity integer
    check (max_guest_capacity is null or max_guest_capacity > 0),

  price_min_usd numeric
    check (price_min_usd is null or price_min_usd >= 0),
  price_max_usd numeric
    check (price_max_usd is null or price_max_usd >= 0),

  check_in_time text,
  check_out_time text,

  suitable_for_children boolean not null default false,
  wheelchair_accessible boolean not null default false,
  smoking_allowed boolean not null default false,
  pets_allowed boolean not null default false,
  beach_access_or_view boolean not null default false,
  transportation_provided boolean not null default false,
  amenities_complete boolean not null default false,

  amenities text[] not null default '{}',

  address text,
  parish text,
  transportation_notes text,
  pickup_notes text,

  image_url text,
  is_featured boolean not null default false,

  location_point extensions.geometry(Point, 4326),

  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accommodations_price_range_check check (
    price_min_usd is null
    or price_max_usd is null
    or price_min_usd <= price_max_usd
  )
);

comment on table public.accommodations is 'Vendor-owned accommodation listings (draft / published / archived).';
comment on column public.accommodations.location_point is
  'Geographic point (WGS84); set only via set_accommodation_location_point RPC.';

create index if not exists idx_accommodations_vendor_id
  on public.accommodations (vendor_id);

create index if not exists idx_accommodations_status
  on public.accommodations (status);

create index if not exists idx_accommodations_vendor_created_at
  on public.accommodations (vendor_id, created_at desc);

create index if not exists idx_accommodations_location_point
  on public.accommodations
  using gist (location_point);

drop trigger if exists trg_accommodations_set_updated_at on public.accommodations;
create trigger trg_accommodations_set_updated_at
before update on public.accommodations
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RPC: set or clear location_point (mirror set_activity_location_point)
-- -----------------------------------------------------------------------------

create or replace function public.set_accommodation_location_point(
  p_accommodation_id uuid,
  p_lng double precision default null,
  p_lat double precision default null
)
returns void
language plpgsql
as $$
begin
  if p_lng is null or p_lat is null then
    update public.accommodations
      set location_point = null
    where id = p_accommodation_id;
  else
    update public.accommodations
      set location_point = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)
    where id = p_accommodation_id;
  end if;
end;
$$;

revoke all on function public.set_accommodation_location_point(uuid, double precision, double precision) from public;
grant execute on function public.set_accommodation_location_point(uuid, double precision, double precision) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: accommodations (mirror activities)
-- -----------------------------------------------------------------------------

alter table public.accommodations enable row level security;

create policy "Accommodations select"
on public.accommodations
for select
to anon, authenticated
using (
  status = 'published'
  or (
    (select auth.uid()) is not null
    and (
      public.is_vendor_owner(vendor_id)
      or public.is_site_admin()
    )
  )
);

create policy "Accommodations insert"
on public.accommodations
for insert
to authenticated
with check (
  public.is_vendor_owner(vendor_id)
  or public.is_site_admin()
);

create policy "Accommodations update"
on public.accommodations
for update
to authenticated
using (
  public.is_vendor_owner(vendor_id)
  or public.is_site_admin()
)
with check (
  public.is_vendor_owner(vendor_id)
  or public.is_site_admin()
);

create policy "Accommodations delete"
on public.accommodations
for delete
to authenticated
using (
  public.is_vendor_owner(vendor_id)
  or public.is_site_admin()
);

-- -----------------------------------------------------------------------------
-- Vendors: owner may update own profile (keep admin update policy)
-- -----------------------------------------------------------------------------

create policy "Vendors update (owner)"
on public.vendors
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Column-level privileges: vendors
-- -----------------------------------------------------------------------------

revoke insert, update on public.vendors from authenticated;

grant insert (
  name,
  owner_user_id,
  owner_full_name,
  business_phone,
  personal_phone,
  contact_email,
  is_incorporated,
  country_of_incorporation,
  business_registration_number
) on public.vendors to authenticated;

grant update (
  name,
  owner_full_name,
  business_phone,
  personal_phone,
  contact_email,
  is_incorporated,
  country_of_incorporation,
  business_registration_number
) on public.vendors to authenticated;

-- -----------------------------------------------------------------------------
-- Column-level privileges: accommodations (exclude location_point, is_featured)
-- -----------------------------------------------------------------------------

revoke insert, update on public.accommodations from authenticated;

grant insert (
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
) on public.accommodations to authenticated;

grant update (
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
) on public.accommodations to authenticated;
