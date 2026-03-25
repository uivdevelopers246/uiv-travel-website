-- Storage bucket and policies for accommodation images (mirrors activity-images setup)

-- -----------------------------------------------------------------------------
-- STORAGE bucket: accommodation-images
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('accommodation-images', 'accommodation-images', true)
on conflict (id) do update set public = true;

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
