create table public.itinerary_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index itinerary_generations_user_created_at_idx
  on public.itinerary_generations (user_id, created_at desc);

comment on table public.itinerary_generations is
  'Append-only log of AI itinerary generations, used for per-user rate limiting.';

alter table public.itinerary_generations enable row level security;

create policy "Itinerary generations user select own"
  on public.itinerary_generations
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.itinerary_generations from public, anon, authenticated;
grant select on table public.itinerary_generations to authenticated;

create or replace function public.record_itinerary_generation()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz;
  v_generation_count bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  v_now := clock_timestamp();

  select count(*)
    into v_generation_count
  from public.itinerary_generations
  where user_id = v_user_id
    and created_at >= v_now - interval '60 minutes';

  if v_generation_count >= 10 then
    return false;
  end if;

  insert into public.itinerary_generations (user_id, created_at)
  values (v_user_id, v_now);

  return true;
end;
$$;

revoke all on function public.record_itinerary_generation() from public, anon;
grant execute on function public.record_itinerary_generation() to authenticated;

comment on function public.record_itinerary_generation() is
  'Atomically records one itinerary generation if the authenticated user has fewer than 10 generations in the previous 60 minutes.';
