-- Slot-based availability (ADR-M4-A). RLS: follow-up migration.

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_capacity integer not null check (max_capacity > 0),
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ends_after_starts check (ends_at > starts_at)
);

comment on table public.availability_slots is
  'Vendor time windows for activities; capacity derived from activity_bookings (ADR-M4-A).';

create index idx_slots_activity_starts
  on public.availability_slots (activity_id, starts_at)
  where is_cancelled = false;

-- Denormalized vendor_id must match the activity owner (ADR-M4-A).
create or replace function public.enforce_availability_slot_vendor_matches_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_vendor_id uuid;
begin
  select a.vendor_id
  into v_vendor_id
  from public.activities a
  where a.id = new.activity_id;

  if v_vendor_id is null or new.vendor_id <> v_vendor_id then
    raise exception 'availability_slots.vendor_id must match activities.vendor_id for activity_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_availability_slots_vendor_matches_activity on public.availability_slots;
create trigger trg_availability_slots_vendor_matches_activity
before insert or update of activity_id, vendor_id on public.availability_slots
for each row execute function public.enforce_availability_slot_vendor_matches_activity();

drop trigger if exists trg_availability_slots_set_updated_at on public.availability_slots;
create trigger trg_availability_slots_set_updated_at
before update on public.availability_slots
for each row execute function public.set_updated_at();
