-- Local dev seed: create a default admin + test users/vendors

create extension if not exists pgcrypto with schema extensions;

create or replace function public.seed_user(_email text, _password text)
returns uuid
language plpgsql
set search_path = auth, public
as $$
declare
  v_user_id uuid;
begin
  select id
    into v_user_id
  from auth.users
  where email = _email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      recovery_sent_at,
      email_change_token_new,
      email_change,
      email_change_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user
    )
    values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      _email,
      extensions.crypt(_password, extensions.gen_salt('bf')),
      now(),
      now(),
      '',
      now(),
      '',
      now(),
      '',
      '',
      now(),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      '{}'::jsonb,
      now(),
      now(),
      false
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(_password, extensions.gen_salt('bf')),
        email_confirmed_at = now(),
        invited_at = now(),
        confirmation_sent_at = now(),
        recovery_sent_at = now(),
        email_change_sent_at = now(),
        last_sign_in_at = now(),
        raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', _email),
    'email',
    now(),
    now(),
    now()
  )
  on conflict do nothing;

  insert into public.profiles (id, display_name, created_by, updated_by)
  values (
    v_user_id,
    split_part(_email, '@', 1),
    v_user_id,
    v_user_id
  )
  on conflict (id) do nothing;

  return v_user_id;
end;
$$;

do $$
declare
  v_admin_id uuid;
  v_vendor_id uuid;
begin
  v_admin_id := public.seed_user('taonichol86@gmail.com', 'Random1234');
  insert into public.site_admins (user_id)
  values (v_admin_id)
  on conflict (user_id) do nothing;

  v_vendor_id := public.seed_user('vendor1@uiv.com', 'Random1234');
  insert into public.vendors (name, owner_user_id)
  values ('Vendor 1', v_vendor_id)
  on conflict (owner_user_id) do nothing;

  v_vendor_id := public.seed_user('vendor2@uiv.com', 'Random1234');
  insert into public.vendors (name, owner_user_id)
  values ('Vendor 2', v_vendor_id)
  on conflict (owner_user_id) do nothing;

  v_vendor_id := public.seed_user('vendor3@uiv.com', 'Random1234');
  insert into public.vendors (name, owner_user_id)
  values ('Vendor 3', v_vendor_id)
  on conflict (owner_user_id) do nothing;

  perform public.seed_user('user1@uiv.com', 'Random1234');
  perform public.seed_user('user2@uiv.com', 'Random1234');
  perform public.seed_user('user3@uiv.com', 'Random1234');
end $$;

drop function public.seed_user(text, text);
