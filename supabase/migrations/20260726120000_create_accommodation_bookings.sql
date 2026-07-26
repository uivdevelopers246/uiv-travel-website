-- Per-listing stay reservations (ADR-M4-D). Full M4-C status surface from day one.
-- Overlap enforcement and RLS: follow-up migrations.

create table public.accommodation_bookings (
  id uuid primary key default gen_random_uuid(),
  accommodation_id uuid not null references public.accommodations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete restrict,

  order_id uuid references public.orders (id) on delete restrict,

  check_in date not null,
  check_out date not null,
  guests integer not null check (guests >= 1),

  status text not null default 'pending_approval'
    check (
      status in (
        'pending_approval',
        'confirmed',
        'declined',
        'expired',
        'cancelled',
        'completed'
      )
    ),

  expires_at timestamptz,

  unit_price_cents integer not null,
  subtotal_cents integer not null,
  discount_cents integer not null default 0,
  total_cents integer not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accommodation_bookings_check_out_after_check_in
    check (check_out > check_in)
);

comment on table public.accommodation_bookings is
  'User stay reservations for accommodations; order_id set when created from SetupIntent fulfillment (ADR-M4-D / ADR-M4-C).';

comment on column public.accommodation_bookings.expires_at is
  'SLA deadline for pending_approval; null for statuses other than pending_approval.';

comment on column public.accommodation_bookings.check_in is
  'Stay start date (inclusive); inventory uses half-open [check_in, check_out).';

comment on column public.accommodation_bookings.check_out is
  'Stay end date (exclusive); must be after check_in.';

create index idx_accommodation_bookings_accommodation_confirmed
  on public.accommodation_bookings (accommodation_id)
  where status = 'confirmed';

create index idx_accommodation_bookings_accommodation_pending_approval
  on public.accommodation_bookings (accommodation_id, expires_at)
  where status = 'pending_approval';

create index idx_accommodation_bookings_pending_approval_expires_at
  on public.accommodation_bookings (expires_at)
  where status = 'pending_approval';

create index idx_accommodation_bookings_order_id
  on public.accommodation_bookings (order_id);

create index idx_accommodation_bookings_user_id
  on public.accommodation_bookings (user_id);

create index idx_accommodation_bookings_vendor_id
  on public.accommodation_bookings (vendor_id);

drop trigger if exists trg_accommodation_bookings_set_updated_at on public.accommodation_bookings;
create trigger trg_accommodation_bookings_set_updated_at
before update on public.accommodation_bookings
for each row execute function public.set_updated_at();
