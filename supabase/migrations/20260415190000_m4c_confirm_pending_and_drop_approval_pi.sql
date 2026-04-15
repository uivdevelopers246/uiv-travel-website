-- M4-C (single settlement charge): confirm pending lines at approve time (DB only, no Stripe).
-- Also drops orders.stripe_approval_payment_intent_id — capture uses one PI after all lines are terminal.

drop index if exists public.orders_stripe_approval_payment_intent_id_key;

alter table public.orders drop column if exists stripe_approval_payment_intent_id;

-- Vendor scope: pending_approval → confirmed for one vendor on an order.
create or replace function public.confirm_pending_activity_bookings_for_vendor_on_order(
  p_order_id uuid,
  p_vendor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.activity_bookings
  set
    status = 'confirmed',
    expires_at = null
  where order_id = p_order_id
    and vendor_id = p_vendor_id
    and status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.confirm_pending_activity_bookings_for_vendor_on_order(uuid, uuid) is
  'Sets pending_approval bookings for one vendor on an order to confirmed (M4-C); returns rows updated.';

revoke all on function public.confirm_pending_activity_bookings_for_vendor_on_order(uuid, uuid) from public;
grant execute on function public.confirm_pending_activity_bookings_for_vendor_on_order(uuid, uuid) to service_role;

-- Admin: confirm all pending_approval rows on the order.
create or replace function public.confirm_all_pending_activity_bookings_for_order(
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.activity_bookings
  set
    status = 'confirmed',
    expires_at = null
  where order_id = p_order_id
    and status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.confirm_all_pending_activity_bookings_for_order(uuid) is
  'Sets all pending_approval bookings on an order to confirmed (M4-C admin); returns rows updated.';

revoke all on function public.confirm_all_pending_activity_bookings_for_order(uuid) from public;
grant execute on function public.confirm_all_pending_activity_bookings_for_order(uuid) to service_role;
