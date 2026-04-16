-- M4-C: vendor-scoped decline when an order has pending bookings for multiple vendors.

create or replace function public.decline_pending_activity_bookings_for_vendor_on_order(
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
    status = 'declined',
    expires_at = null
  where order_id = p_order_id
    and vendor_id = p_vendor_id
    and status = 'pending_approval';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.decline_pending_activity_bookings_for_vendor_on_order(uuid, uuid) is
  'Sets pending_approval bookings for one vendor on an order to declined (M4-C); returns rows updated.';

revoke all on function public.decline_pending_activity_bookings_for_vendor_on_order(uuid, uuid) from public;
grant execute on function public.decline_pending_activity_bookings_for_vendor_on_order(uuid, uuid) to service_role;
