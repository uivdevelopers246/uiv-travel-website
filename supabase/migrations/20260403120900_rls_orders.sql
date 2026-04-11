-- RLS for orders (ADR-M4-B). Authenticated: SELECT, INSERT, UPDATE on own rows; no DELETE.
-- Service role bypasses RLS for webhook fulfillment and status updates.

alter table public.orders enable row level security;

drop policy if exists "Orders user select own" on public.orders;
drop policy if exists "Orders user insert own" on public.orders;
drop policy if exists "Orders user update own" on public.orders;

create policy "Orders user select own"
on public.orders
for select
to authenticated
using (user_id = auth.uid());

create policy "Orders user insert own"
on public.orders
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Orders user update own"
on public.orders
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
