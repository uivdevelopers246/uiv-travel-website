-- RLS for cart_lines (ADR-M4-B). Authenticated users: full CRUD on own rows only.
-- Service role bypasses RLS for webhook-driven cart clearing.

alter table public.cart_lines enable row level security;

drop policy if exists "Cart lines user all own" on public.cart_lines;

create policy "Cart lines user all own"
on public.cart_lines
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
