create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- public profile fields
  display_name text,
  avatar_url text,
  bio text,

  -- multi-tenant hook (for later)
  -- tenant_id uuid,

  -- audit fields
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
