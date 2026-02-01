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
drop policy if exists "Site admins can read self" on public.site_admins;

-- profiles
drop policy if exists "Site admins can view all profiles" on public.profiles;

-- storage objects
drop policy if exists "Activity images public read" on storage.objects;
drop policy if exists "Activity images upload" on storage.objects;
drop policy if exists "Activity images update" on storage.objects;
drop policy if exists "Activity images delete" on storage.objects;

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

-- Allow owner to create their own vendor row; admins can create any vendor.
create policy "Vendors insert (admins only)"
on public.vendors
for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
  OR public.is_site_admin()
);

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

create policy "Site admins can read self"
on public.site_admins
for select
to authenticated
using (user_id = auth.uid());

create policy "Site admins table access"
on public.site_admins
for all
to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());

-- -----------------------------------------------------------------------------
-- PROFILES policies (admin access)
-- -----------------------------------------------------------------------------

create policy "Site admins can view all profiles"
on public.profiles
for select
to authenticated
using (public.is_site_admin());

-- -----------------------------------------------------------------------------
-- STORAGE policies (activity-images bucket)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('activity-images', 'activity-images', true)
on conflict (id) do update set public = true;

create policy "Activity images public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'activity-images');

create policy "Activity images upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'activity-images'
  AND (
    public.is_site_admin()
    OR (
      public.vendor_id_for_user() is not null
      AND name like (public.vendor_id_for_user()::text || '/%')
    )
  )
);

create policy "Activity images update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'activity-images'
  AND (
    public.is_site_admin()
    OR (
      public.vendor_id_for_user() is not null
      AND name like (public.vendor_id_for_user()::text || '/%')
    )
    OR auth.uid() = owner
  )
)
with check (
  bucket_id = 'activity-images'
  AND (
    public.is_site_admin()
    OR (
      public.vendor_id_for_user() is not null
      AND name like (public.vendor_id_for_user()::text || '/%')
    )
    OR auth.uid() = owner
  )
);

create policy "Activity images delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'activity-images'
  AND (
    public.is_site_admin()
    OR (
      public.vendor_id_for_user() is not null
      AND name like (public.vendor_id_for_user()::text || '/%')
    )
    OR auth.uid() = owner
  )
);
