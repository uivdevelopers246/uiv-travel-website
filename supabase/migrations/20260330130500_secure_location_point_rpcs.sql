create or replace function public.set_activity_location_point(
  p_activity_id uuid,
  p_lng double precision default null,
  p_lat double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_vendor_id uuid;
begin
  select vendor_id
    into v_vendor_id
  from public.activities
  where id = p_activity_id;

  if v_vendor_id is null then
    return;
  end if;

  if not (
    public.is_vendor_owner(v_vendor_id)
    or public.is_site_admin()
  ) then
    raise exception 'permission denied for table activities';
  end if;

  if p_lng is null or p_lat is null then
    update public.activities
      set location_point = null
    where id = p_activity_id;
  else
    update public.activities
      set location_point = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)
    where id = p_activity_id;
  end if;
end;
$$;

revoke all on function public.set_activity_location_point(uuid, double precision, double precision) from public;
grant execute on function public.set_activity_location_point(uuid, double precision, double precision) to authenticated;

create or replace function public.set_accommodation_location_point(
  p_accommodation_id uuid,
  p_lng double precision default null,
  p_lat double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_vendor_id uuid;
begin
  select vendor_id
    into v_vendor_id
  from public.accommodations
  where id = p_accommodation_id;

  if v_vendor_id is null then
    return;
  end if;

  if not (
    public.is_vendor_owner(v_vendor_id)
    or public.is_site_admin()
  ) then
    raise exception 'permission denied for table accommodations';
  end if;

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
