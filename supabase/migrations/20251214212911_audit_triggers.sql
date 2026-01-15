-- function to handle audit fields on insert/update
create or replace function public.handle_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  -- Try to get user id from JWT (Supabase helper).
  -- If there's no JWT / we're in a non-auth context, fall back to NULL.
  begin
    v_user_id := auth.uid();
  exception when others then
    v_user_id := null;
  end;

  if (TG_OP = 'INSERT') then
    -- Timestamps
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();

    -- Who created the row:
    --  - Use explicitly provided created_by if set
    --  - Otherwise use v_user_id (may be NULL if no JWT)
    new.created_by := coalesce(new.created_by, v_user_id);

    -- Who last updated the row (on insert this is also the creator)
    -- Strict: always the current user or NULL
    new.updated_by := v_user_id;

  elsif (TG_OP = 'UPDATE') then
    -- Always bump updated_at on any update
    new.updated_at := now();

    -- Strict: always overwrite with the current user (or NULL if none)
    new.updated_by := v_user_id;
  end if;

  return new;
end;
$$;

-- attach trigger to profiles (you can reuse this function for other tables later)
drop trigger if exists handle_audit_fields_on_profiles on public.profiles;

create trigger handle_audit_fields_on_profiles
before insert or update on public.profiles
for each row
execute function public.handle_audit_fields();
