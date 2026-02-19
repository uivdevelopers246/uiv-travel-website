create or replace function public.set_activity_geocode(
  p_activity_id uuid,
  p_lng double precision default null,
  p_lat double precision default null,
  p_quality text default null,
  p_label text default null,
  p_feature_id text default null
)
returns void
language plpgsql
as $$
begin
  if p_lng is null or p_lat is null then
    update public.activities
      set location_point = null,
          geocode_quality = null,
          geocode_label = null,
          geocode_feature_id = null
    where id = p_activity_id;
  else
    update public.activities
      set location_point = st_setsrid(st_makepoint(p_lng, p_lat), 4326),
          geocode_quality = p_quality,
          geocode_label = p_label,
          geocode_feature_id = p_feature_id
    where id = p_activity_id;
  end if;
end;
$$;

revoke all on function public.set_activity_geocode(uuid, double precision, double precision, text, text, text) from public;
grant execute on function public.set_activity_geocode(uuid, double precision, double precision, text, text, text) to authenticated;
