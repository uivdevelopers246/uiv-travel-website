-- Local development only. Add prices without overwriting edited/closed nights.
-- Existing seed properties receive 30 nights beginning two weeks from UTC today.
insert into public.accommodation_nights (accommodation_id, night, price_cents, is_available)
select a.id,
       (now() at time zone 'UTC')::date + 14 + day_offset,
       case a.id
         when '22222222-2222-4222-8222-222222222222'::uuid then 12500
         when '22222222-2222-4222-8222-222222222223'::uuid then 17500
         when '22222222-2222-4222-8222-222222222224'::uuid then 25000
         else 35000
       end,
       true
from public.accommodations a
cross join generate_series(0, 29) as days(day_offset)
where a.id in (
  '22222222-2222-4222-8222-222222222222'::uuid,
  '22222222-2222-4222-8222-222222222223'::uuid,
  '22222222-2222-4222-8222-222222222224'::uuid,
  '22222222-2222-4222-8222-222222222225'::uuid
)
  and a.status = 'published'
on conflict (accommodation_id, night) do nothing;
