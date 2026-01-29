-- Enable RLS
alter table public.activities enable row level security;
alter table public.vendors enable row level security;
alter table public.site_admins enable row level security;

-- -----------------------------------------------------------------------------
-- DROP old policies (safe/idempotent)
-- -----------------------------------------------------------------------------

-- activities
drop policy if exists "Public can view published activities" on public.activities;
drop policy if exists "Vendor owner can view their activities" on public.activities;
drop policy if exists "Vendor owner can insert activities" on public.activities;
drop policy if exists "Vendor owner can update their activities" on public.activities;
drop policy if exists "Vendor owner can delete their activities" on public.activities;
drop policy if exists "Site admins can manage all activities" on public.activities;
drop policy if exists "Activities select" on public.activities;
drop policy if exists "Activities insert" on public.activities;
drop policy if exists "Activities update" on public.activities;
drop policy if exists "Activities delete" on public.activities;

-- vendors
drop policy if exists "Vendor owner can view their vendor" on public.vendors;
drop policy if exists "Site admins can manage vendors" on public.vendors;
drop policy if exists "Vendors select" on public.vendors;
drop policy if exists "Vendors insert (admins only)" on public.vendors;
drop policy if exists "Vendors update (admins only)" on public.vendors;
drop policy if exists "Vendors delete (admins only)" on public.vendors;

-- site_admins
drop policy if exists "Only site admins can read site_admins" on public.site_admins;
drop policy if exists "Only site admins can manage site_admins" on public.site_admins;
drop policy if exists "Site admins table access" on public.site_admins;

-- -----------------------------------------------------------------------------
-- ACTIVITIES policies (consolidated)
-- -----------------------------------------------------------------------------

-- SELECT:
-- - public can see published
-- - vendor owner can see their own (any status)
-- - site admins can see everything
create policy "Activities select"
on public.activities
for select
to anon, authenticated
using (
  status = 'published'
  OR (
    (select auth.uid()) is not null
    AND (
      public.is_vendor_owner(vendor_id)
      OR public.is_site_admin()
    )
  )
);

-- INSERT:
-- - vendor owner can insert for their vendor
-- - site admins can insert for any vendor
create policy "Activities insert"
on public.activities
for insert
to authenticated
with check (
  public.is_vendor_owner(vendor_id)
  OR public.is_site_admin()
);

-- UPDATE:
-- - vendor owner can update their vendor’s activities
-- - site admins can update any
create policy "Activities update"
on public.activities
for update
to authenticated
using (
  public.is_vendor_owner(vendor_id)
  OR public.is_site_admin()
)
with check (
  public.is_vendor_owner(vendor_id)
  OR public.is_site_admin()
);

-- DELETE:
-- - vendor owner can delete their vendor’s activities
-- - site admins can delete any
create policy "Activities delete"
on public.activities
for delete
to authenticated
using (
  public.is_vendor_owner(vendor_id)
  OR public.is_site_admin()
);

-- -----------------------------------------------------------------------------
-- VENDORS policies (simple + safe)
-- -----------------------------------------------------------------------------

-- Vendors can read their own vendor row; site admins can read all vendors
create policy "Vendors select"
on public.vendors
for select
to authenticated
using (
  owner_user_id = (select auth.uid())
  OR public.is_site_admin()
);

-- If you want vendors to be able to create their own vendor row from the UI,
-- you can loosen this later. For now: admins only manage vendors.
create policy "Vendors insert (admins only)"
on public.vendors
for insert
to authenticated
with check (public.is_site_admin());

create policy "Vendors update (admins only)"
on public.vendors
for update
to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());

create policy "Vendors delete (admins only)"
on public.vendors
for delete
to authenticated
using (public.is_site_admin());

-- -----------------------------------------------------------------------------
-- SITE_ADMINS policies (single policy)
-- -----------------------------------------------------------------------------

create policy "Site admins table access"
on public.site_admins
for all
to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());
