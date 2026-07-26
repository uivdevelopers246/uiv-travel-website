-- Cart line CHECKs for accommodation stays (ADR-M4-D): require stay fields, null activity
-- columns (and vice versa); partial unique merge key for same stay window.

alter table public.cart_lines
  drop constraint if exists cart_lines_activity_requires_slot_and_participants;

alter table public.cart_lines
  add constraint cart_lines_activity_requires_slot_and_participants check (
    line_type <> 'activity'
    or (
      slot_id is not null
      and participants is not null
      and participants >= 1
      and accommodation_id is null
      and check_in is null
      and check_out is null
      and guests is null
    )
  );

alter table public.cart_lines
  drop constraint if exists cart_lines_accommodation_requires_stay_fields;

alter table public.cart_lines
  add constraint cart_lines_accommodation_requires_stay_fields check (
    line_type <> 'accommodation'
    or (
      accommodation_id is not null
      and check_in is not null
      and check_out is not null
      and guests is not null
      and guests >= 1
      and check_out > check_in
      and slot_id is null
      and participants is null
    )
  );

create unique index if not exists cart_lines_user_accommodation_stay_key
  on public.cart_lines (user_id, accommodation_id, check_in, check_out)
  where line_type = 'accommodation'
    and accommodation_id is not null
    and check_in is not null
    and check_out is not null;

comment on column public.cart_lines.line_type is
  'activity or accommodation; CHECKs enforce type-specific columns and null the other kind.';

comment on column public.cart_lines.accommodation_id is
  'Required for accommodation lines; null for activity lines. Merge key with check_in/check_out.';

comment on column public.cart_lines.check_in is
  'Accommodation stay start date (inclusive); required for accommodation lines.';

comment on column public.cart_lines.check_out is
  'Accommodation stay end date (exclusive); required for accommodation lines; must be after check_in.';

comment on column public.cart_lines.guests is
  'Guest count for accommodation lines; null for activity lines.';
