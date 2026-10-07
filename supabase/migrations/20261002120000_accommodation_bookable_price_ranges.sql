-- Display prices follow live calendar inventory, including expiring holds and
-- UTC date rollover. Stored listing prices are legacy data, not a price source.
create or replace function public.accommodation_bookable_price_ranges(
  p_accommodation_ids uuid[]
)
returns table (accommodation_id uuid, price_min_usd numeric, price_max_usd numeric)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select a.id, min(n.price_cents) / 100.0, max(n.price_cents) / 100.0
  from public.accommodations a
  left join public.accommodation_nights n
    on n.accommodation_id = a.id
    and n.night >= (now() at time zone 'UTC')::date
    and n.is_available and n.price_cents is not null
    and not public.accommodation_stay_is_held(a.id, n.night, n.night + 1)
  where a.id = any(p_accommodation_ids)
    and (
      a.status = 'published'
      or auth.role() = 'service_role'
      or public.is_vendor_owner(a.vendor_id)
      or public.is_site_admin()
    )
  group by a.id;
$$;

revoke all on function public.accommodation_bookable_price_ranges(uuid[]) from public;
grant execute on function public.accommodation_bookable_price_ranges(uuid[]) to anon, authenticated, service_role;

-- Accommodations already grant writes by column. Hosts now manage prices only
-- through set_accommodation_nights, with its held-night and ownership checks.
revoke insert (price_min_usd, price_max_usd), update (price_min_usd, price_max_usd)
  on public.accommodations from authenticated;

comment on function public.accommodation_bookable_price_ranges(uuid[]) is
  'Live USD display range of open, unheld nights from UTC today onward; null prices mean no bookable nights. Draft and archived listings are visible only to their owner, a site admin, or service_role.';
