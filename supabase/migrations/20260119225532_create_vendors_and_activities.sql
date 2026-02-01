-- Vendors: single shared vendor account -> owner_user_id


create table if not exists public.vendors (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_user_id uuid not null unique references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- Site admins: Admins can manage all activities

create table if not exists public.site_admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

-- Activities

create table if not exists public.activities (
    id uuid primary key default gen_random_uuid(),
    vendor_id uuid not null references public.vendors(id) on delete cascade,

    title text not null,
    description text,
    location text,
    category text not null check (category in ('water-sports', 'wildlife', 'adventure', 'culture', 'nature')),
    duration_hours numeric check (duration_hours is null or duration_hours > 0),
    price_per_person numeric check  (price_per_person is null or price_per_person >= 0),
    max_capacity integer check (max_capacity is null or max_capacity > 0),
    rating numeric check (rating is null or (rating >= 0 and rating <= 5)),
    image_url text,
    is_featured boolean not null default false,

    status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- updated_at trigger helper

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
    new.updated_at = now();
    return new;
end
$$;


drop trigger if exists trg_vendors_set_updated_at on public.vendors;
create trigger trg_vendors_set_updated_at
before update on public.vendors
for each row execute function public.set_updated_at();

drop trigger if exists trg_activities_set_updated_at on public.activities;
create trigger trg_activities_set_updated_at
before update on public.activities
for each row execute function public.set_updated_at();

-- Helper functions for RLS (stable = good for polcies)
create or replace function public.is_site_admin()
returns boolean
language sql stable
security definer
set search_path = pg_catalog, public
as $$
    select exists (
        select 1 
        from public.site_admins sa
        where sa.user_id = auth.uid()
    );
$$;


create or replace function public.is_vendor_owner(v_id uuid)
returns boolean
language sql stable
set search_path = pg_catalog, public
as $$
    select exists (
        select 1 from public.vendors v
        where v.id = v_id
            and v.owner_user_id = auth.uid()
    );
$$;

-- Creating indexes on the tables (Improves query performance and remove Supabase linter warning due to missing indexes)
-- These indexes support efficient queries on vendor_id, status, and vendor_id + created_at.

create index if not exists idx_activities_vendor_id
  on public.activities (vendor_id);

create index if not exists idx_activities_status
  on public.activities (status);

create index if not exists idx_activities_vendor_created_at
  on public.activities (vendor_id, created_at desc);
