-- Public booking calendar: a missing price always means the night cannot be
-- booked. Keep host-only prices, booking details and hold reasons private.
create or replace function public.accommodation_booking_calendar(
  p_accommodation_id uuid, p_first_night date, p_last_night date
)
returns table (night date, price_cents integer)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if p_first_night is null or p_last_night is null or not isfinite(p_first_night)
    or not isfinite(p_last_night) or p_last_night < p_first_night
    or p_last_night - p_first_night >= 366 then
    raise exception 'Invalid calendar range' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.accommodations where id = p_accommodation_id and status = 'published'
  ) then return; end if;

  return query
    select p_first_night + offset_day,
      case when n.is_available and n.price_cents >= 50
        and n.night >= (now() at time zone 'UTC')::date
        and not public.accommodation_stay_is_held(p_accommodation_id, n.night, n.night + 1)
      then n.price_cents else null end
    from generate_series(0, p_last_night - p_first_night) as offset_day
    left join public.accommodation_nights n
      on n.accommodation_id = p_accommodation_id and n.night = p_first_night + offset_day
    order by offset_day;
end;
$$;

revoke all on function public.accommodation_booking_calendar(uuid, date, date) from public;
grant execute on function public.accommodation_booking_calendar(uuid, date, date) to anon, authenticated, service_role;

comment on function public.accommodation_booking_calendar(uuid, date, date) is
  'Public nightly USD prices for published stays. Null means past, unpriced, closed or held; no private reservation data is returned.';
