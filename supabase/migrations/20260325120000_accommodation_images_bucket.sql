-- Storage bucket and policies for accommodation images (mirrors activity-images setup)

-- -----------------------------------------------------------------------------
-- STORAGE bucket: accommodation-images
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('accommodation-images', 'accommodation-images', true)
on conflict (id) do update set public = true;

-- Defensive repair for remotes whose migration history is ahead of actual helper
-- function state. Storage policies below depend on vendor_id_for_user().
create or replace function public.vendor_id_for_user()
returns uuid
language sql stable
security definer
set search_path = pg_catalog, public
as $$
  select v.id
  from public.vendors v
  where v.owner_user_id = auth.uid()
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- STORAGE policies (accommodation-images bucket)
-- -----------------------------------------------------------------------------

create policy "Accommodation images public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'accommodation-images');

create policy "Accommodation images upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'accommodation-images'
  AND (
    public.is_site_admin()
    OR (
      public.vendor_id_for_user() is not null
      AND name like (public.vendor_id_for_user()::text || '/%')
    )
  )
);

create policy "Accommodation images update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'accommodation-images'
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
  bucket_id = 'accommodation-images'
  AND (
    public.is_site_admin()
    OR (
      public.vendor_id_for_user() is not null
      AND name like (public.vendor_id_for_user()::text || '/%')
    )
  )
);

create policy "Accommodation images delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'accommodation-images'
  AND (
    public.is_site_admin()
    OR (
      public.vendor_id_for_user() is not null
      AND name like (public.vendor_id_for_user()::text || '/%')
    )
    OR auth.uid() = owner
  )
);
