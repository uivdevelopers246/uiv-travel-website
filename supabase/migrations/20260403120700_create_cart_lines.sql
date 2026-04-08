-- Shopping cart lines (ADR-M4-B). RLS policies: follow-up migration.

create table public.cart_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  line_type text not null
    check (line_type in ('activity', 'accommodation')),
  slot_id uuid references public.availability_slots (id) on delete restrict,
  participants integer
    check (participants is null or participants >= 1),

  accommodation_id uuid references public.accommodations (id) on delete restrict,
  check_in date,
  check_out date,
  guests integer
    check (guests is null or guests >= 1),

  unit_price_cents integer not null,
  line_subtotal_cents integer not null,
  line_discount_cents integer not null default 0,
  line_total_cents integer not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cart_lines_activity_requires_slot_and_participants check (
    line_type <> 'activity'
    or (
      slot_id is not null
      and participants is not null
      and participants >= 1
    )
  ),
  constraint cart_lines_unit_price_non_negative check (unit_price_cents >= 0),
  constraint cart_lines_line_subtotal_non_negative check (line_subtotal_cents >= 0),
  constraint cart_lines_line_discount_non_negative check (line_discount_cents >= 0),
  constraint cart_lines_line_total_non_negative check (line_total_cents >= 0),
  constraint cart_lines_check_out_after_check_in check (
    check_in is null
    or check_out is null
    or check_out > check_in
  )
);

comment on table public.cart_lines is
  'Per-user cart lines; activity lines merge on (user_id, slot_id). Price fields are snapshots (ADR-M4-B).';

comment on column public.cart_lines.line_type is
  'MVP writes activity only; accommodation placeholders for Phase 2.';
comment on column public.cart_lines.accommodation_id is
  'Phase 2; nullable until accommodation checkout.';
comment on column public.cart_lines.check_in is
  'Phase 2 accommodation stay start (date).';
comment on column public.cart_lines.check_out is
  'Phase 2 accommodation stay end (date).';
comment on column public.cart_lines.guests is
  'Phase 2 guest count for accommodation lines.';

create index cart_lines_user_id_idx on public.cart_lines (user_id);

create unique index cart_lines_user_id_slot_id_activity_key
  on public.cart_lines (user_id, slot_id)
  where line_type = 'activity'
    and slot_id is not null;

drop trigger if exists trg_cart_lines_set_updated_at on public.cart_lines;
create trigger trg_cart_lines_set_updated_at
before update on public.cart_lines
for each row execute function public.set_updated_at();

alter table public.cart_lines enable row level security;
