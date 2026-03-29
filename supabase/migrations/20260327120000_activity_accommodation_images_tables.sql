-- Migration: Create images tables for activities and accommodations
-- Supports up to 20 images per activity/accommodation with ordering

-- Activity Images Table
create table if not exists public.activity_images (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  image_url text not null,
  display_order smallint not null default 0,
  alt_text text,
  created_at timestamptz not null default now(),
  
  -- Ensure ordering is unique per activity
  unique (activity_id, display_order)
);

-- Create index for faster lookups
create index if not exists activity_images_activity_id_idx on public.activity_images(activity_id);
create index if not exists activity_images_display_order_idx on public.activity_images(activity_id, display_order);

-- Accommodation Images Table
create table if not exists public.accommodation_images (
  id uuid primary key default gen_random_uuid(),
  accommodation_id uuid not null references public.accommodations(id) on delete cascade,
  image_url text not null,
  display_order smallint not null default 0,
  alt_text text,
  created_at timestamptz not null default now(),
  
  -- Ensure ordering is unique per accommodation
  unique (accommodation_id, display_order)
);

-- Create index for faster lookups
create index if not exists accommodation_images_accommodation_id_idx on public.accommodation_images(accommodation_id);
create index if not exists accommodation_images_display_order_idx on public.accommodation_images(accommodation_id, display_order);

-- Function to enforce max 20 images per activity
create or replace function check_activity_images_limit()
returns trigger as $$
begin
  if (select count(*) from public.activity_images where activity_id = NEW.activity_id) >= 20 then
    raise exception 'Maximum of 20 images allowed per activity';
  end if;
  return NEW;
end;
$$ language plpgsql;

-- Function to enforce max 20 images per accommodation
create or replace function check_accommodation_images_limit()
returns trigger as $$
begin
  if (select count(*) from public.accommodation_images where accommodation_id = NEW.accommodation_id) >= 20 then
    raise exception 'Maximum of 20 images allowed per accommodation';
  end if;
  return NEW;
end;
$$ language plpgsql;

-- Trigger to enforce activity images limit
drop trigger if exists enforce_activity_images_limit on public.activity_images;
create trigger enforce_activity_images_limit
  before insert on public.activity_images
  for each row
  execute function check_activity_images_limit();

-- Trigger to enforce accommodation images limit
drop trigger if exists enforce_accommodation_images_limit on public.accommodation_images;
create trigger enforce_accommodation_images_limit
  before insert on public.accommodation_images
  for each row
  execute function check_accommodation_images_limit();

-- RLS Policies for activity_images
alter table public.activity_images enable row level security;

-- Public read access for published activities' images
create policy "Activity images public read"
  on public.activity_images for select
  using (
    exists (
      select 1 from public.activities
      where activities.id = activity_images.activity_id
      and activities.status = 'published'
    )
  );

-- Vendor can manage their own activity images
create policy "Vendors can manage own activity images"
  on public.activity_images for all
  using (
    exists (
      select 1 from public.activities a
      join public.vendors v on v.id = a.vendor_id
      where a.id = activity_images.activity_id
      and v.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.activities a
      join public.vendors v on v.id = a.vendor_id
      where a.id = activity_images.activity_id
      and v.owner_user_id = auth.uid()
    )
  );

-- Admin can manage all activity images
create policy "Admins can manage all activity images"
  on public.activity_images for all
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- RLS Policies for accommodation_images
alter table public.accommodation_images enable row level security;

-- Public read access for published accommodations' images
create policy "Accommodation images public read"
  on public.accommodation_images for select
  using (
    exists (
      select 1 from public.accommodations
      where accommodations.id = accommodation_images.accommodation_id
      and accommodations.status = 'published'
    )
  );

-- Vendor can manage their own accommodation images
create policy "Vendors can manage own accommodation images"
  on public.accommodation_images for all
  using (
    exists (
      select 1 from public.accommodations a
      join public.vendors v on v.id = a.vendor_id
      where a.id = accommodation_images.accommodation_id
      and v.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.accommodations a
      join public.vendors v on v.id = a.vendor_id
      where a.id = accommodation_images.accommodation_id
      and v.owner_user_id = auth.uid()
    )
  );

-- Admin can manage all accommodation images
create policy "Admins can manage all accommodation images"
  on public.accommodation_images for all
  using (public.is_site_admin())
  with check (public.is_site_admin());
