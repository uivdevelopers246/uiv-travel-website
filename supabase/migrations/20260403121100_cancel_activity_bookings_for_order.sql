-- Bulk cancel confirmed bookings for an order (ADR-M4-B: webhook rollback after partial fulfillment).
-- SECURITY DEFINER: updates must apply regardless of RLS.
-- EXECUTE granted only to service_role (not authenticated); app webhook uses service role.

create or replace function public.cancel_activity_bookings_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.activity_bookings
  set status = 'cancelled'
  where order_id = p_order_id
    and status = 'confirmed';
end;
$$;

comment on function public.cancel_activity_bookings_for_order(uuid) is
  'Sets activity_bookings with the given order_id from confirmed to cancelled (ADR-M4-B).';

revoke all on function public.cancel_activity_bookings_for_order(uuid) from public;
grant execute on function public.cancel_activity_bookings_for_order(uuid) to service_role;
