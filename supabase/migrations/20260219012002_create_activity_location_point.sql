create or replace function public.set_activity_location_point(
  p_activity_id uuid,
  p_lng double precision default null,
  p_lat double precision default null
)
returns void
language plpgsql
as $$
begin
  if p_lng is null or p_lat is null then
    update public.activities
      set location_point = null
    where id = p_activity_id;
  else
    update public.activities
      set location_point = st_setsrid(st_makepoint(p_lng, p_lat), 4326)
    where id = p_activity_id;
  end if;
end;
$$;

revoke all on function public.set_activity_location_point(uuid, double precision, double precision) from public;
grant execute on function public.set_activity_location_point(uuid, double precision, double precision) to authenticated;
