-- Drop legacy authenticated INSERT policy if an older revision of
-- 20260403120500_rls_activity_bookings.sql was already applied.
-- New installs omit that policy; authenticated users cannot insert activity_bookings.

drop policy if exists "Activity bookings user insert" on public.activity_bookings;
