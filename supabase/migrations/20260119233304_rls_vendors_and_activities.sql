-- Enable RLS
alter table public.vendors enable row level security;
alter table public.activities enable row level security;
alter table public.site_admins enable row level security;

--------------------------------------------------------------------------------
-- COLUMN-LEVEL PRIVILEGES (protect system-owned columns like rating)
--------------------------------------------------------------------------------

-- NOTE: RLS controls which rows; these grants control which columns can be written.
-- This prevents vendors (browser app) from setting/modifying rating even on their own rows.

-- Remove any broad write permissions for authenticated on activities
revoke insert, update on public.activities from authenticated;

-- Allow INSERT only on vendor-editable columns (exclude rating and audit/system fields)
grant insert (
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
) on public.activities to authenticated;

-- Allow UPDATE only on vendor-editable columns (exclude rating and audit/system fields)
grant update (
  title,
  description,
  location,
  category,
  duration_hours,
  price_per_person,
  max_capacity,
  image_url,
  status
) on public.activities to authenticated;


--------------------------------------------------------------------------------
-- RLS POLICIES
--------------------------------------------------------------------------------


-- ACTIVITIES: Public can read published activities
create policy  "Public can view published activities"
on public.activities
for select
to anon, authenticated
using (status = 'published');

--ACTIVITIES: Vendor owner can read their own (draft/published/archived)
create policy "Vendor owner can view their activities"
on public.activities
for select
to anon, authenticated
using (public.is_vendor_owner(vendor_id));

--ACTIVITIES: Vendor owner CRUD operations
create policy "Vendor owner can insert activities"
on public.activities
for insert
to authenticated
with check (public.is_vendor_owner(vendor_id));

create policy "Vendor owner can update their activities"
on public.activities
for update
to authenticated
using (public.is_vendor_owner(vendor_id))
with check (public.is_vendor_owner(vendor_id));

create policy "Vendor owner can delete their activities"
on public.activities
for delete
to authenticated
using (public.is_vendor_owner(vendor_id));

-- ACTIVITIES: Site admin override (manage everything)
create policy "Site admins can manage all activities"
on public.activities
for all
to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());

-- VENDORS: vendor can see their own vendor row; admin can see all
create policy "Vendor owner can view their vendor"
on public.vendors
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "Site admins can manage vendors"
on public.vendors
for all
to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());

-- SITE_ADMINS: lock down table to admins only
create policy "Only site admins can read site_admins"
on public.site_admins
for select
to authenticated
using (public.is_site_admin());

create policy "Only site admins can manage site_admins"
on public.site_admins
for all
to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());
