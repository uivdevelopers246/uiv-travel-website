-- Per-slot reservations (ADR-M4-A). RLS: follow-up migration.

create table public.activity_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.availability_slots (id) on delete restrict,
  activity_id uuid not null references public.activities (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete restrict,

  order_id uuid references public.orders (id) on delete restrict,

  status text not null default 'confirmed'
    check (
      status in (
        'confirmed',
        'cancelled',
        'completed'
      )
    ),

  participants integer not null check (participants >= 1),

  unit_price_cents integer not null,
  subtotal_cents integer not null,
  discount_cents integer not null default 0,
  total_cents integer not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.activity_bookings is
  'User reservations for availability slots; order_id set when created from paid checkout (ADR-M4-A / ADR-M4-B).';

create index idx_activity_bookings_slot_status
  on public.activity_bookings (slot_id, status)
  where status = 'confirmed';

create index idx_activity_bookings_order_id on public.activity_bookings (order_id);

create index idx_activity_bookings_user_id on public.activity_bookings (user_id);

create index idx_activity_bookings_vendor_id on public.activity_bookings (vendor_id);

drop trigger if exists trg_activity_bookings_set_updated_at on public.activity_bookings;
create trigger trg_activity_bookings_set_updated_at
before update on public.activity_bookings
for each row execute function public.set_updated_at();
