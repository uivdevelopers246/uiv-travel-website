alter table public.profiles enable row level security;
-- optional (stricter)
alter table public.profiles force row level security;

-- Allow authenticated users to select only their own profile
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using ( auth.uid() = id );

-- Allow authenticated users to insert their own profile (usually via trigger, but safe to have)
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check ( auth.uid() = id );

-- Allow authenticated users to update their own profile
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using ( auth.uid() = id )
with check ( auth.uid() = id );
