# Notification migration reconciliation — 2026-09-10

## Verified state

The linked Supabase project is `uiv-travel-website` (`rtiqwesoqiihujnzxfkh`).
The user confirmed that staging and production share this database.
They subsequently clarified that the production deployment is also still in
development and chose to keep one database to avoid additional hosting costs.
Initial read-only CLI inspection found 37 applied migrations, ending at
`20260601140000_m6_notifications`. After the user explicitly approved the complete
eight-migration plan, all eight were applied successfully through the Supabase CLI
on 2026-09-10. All 45 local and remote migration versions now match, and the final
CLI dry-run reports that the remote database is up to date.

Schema and migration-history exports are in the ignored local directory
`.gstack/notification-audit/`. They contain database definitions and migration
records, not customer-row exports. Treat these as local audit artifacts.

The missing June 1 migration was recovered unchanged from Git commit `4900343`.
Its SQL matches the statements in the applied migration history, ignoring
whitespace. It created `notification_preferences` and `notification_deliveries`,
their keys, indexes, triggers, policies, and grants. Post-apply schema inspection
confirmed the new queue and delivery feedback tables, all suppression and retry
fields, the claim function, notification RLS, and the accommodation booking table.
The legacy delivery table and `disabled_reason` column remain present.

Restoring that file resolves the history mismatch. No `migration repair`, direct
history-table insert, or migration reset is needed for this project.

## Repository changes

- Restore `20260601140000_m6_notifications.sql` as the historical migration.
- Before its first remote application, amend
  `20260626120000_m6_notification_data_model.sql` to extend
  the existing preference table, replace equivalent legacy policies, and grant
  access to the new queue/delivery tables only to `service_role`.
- Add `20260910120000_preserve_legacy_notification_suppression.sql` to translate
  legacy `bounced`, `complained`, and `suppressed` decisions into the new provider
  suppression fields. Existing user choices and legacy delivery records remain.
  Authenticated clients can write account preference fields, including those used
  by the legacy API, but cannot clear the provider suppression fields directly.
- Remove the earlier standalone repair script that directly inserted migration
  history. Use the ordered repository migrations instead.

The new sender treats transactional email differently from the legacy sender:
an ordinary `user_disabled` preference does not block transactional messages.
Provider suppression does block them. This migration preserves the distinction
and does not invent provider suppression for ordinary opt-outs.

## Applied migration plan

The approved CLI push applied these migrations in order:

1. `20260626120000_m6_notification_data_model.sql`
2. `20260626123000_m6_notification_suppression.sql`
3. `20260726120000_create_accommodation_bookings.sql`
4. `20260726120100_create_accommodation_booking_rpcs.sql`
5. `20260726120200_rls_accommodation_bookings.sql`
6. `20260726120300_cart_lines_accommodation_checks.sql`
7. `20260804150000_notification_delivery_reliability.sql`
8. `20260910120000_preserve_legacy_notification_suppression.sql`

The four accommodation migrations were included in the approval and application.
These migrations are now applied history; use new forward migrations for future
schema changes rather than editing these files again.

## Validation performed

- Restored the exported public schema and 37 history records into an isolated
  local Supabase PostgreSQL 17.6 container, with no external network or exposed
  ports. No live application rows were copied.
- Replayed all 45 repository migrations on a fresh local database.
- Replayed all eight pending migrations on the exported schema clone.
- Compared the final notification table definitions, indexes, triggers, RLS
  policies and grants between the two paths: they match after ignoring grant
  statement ordering and dump metadata.
- Ran `scripts/sql/test-notification-migrations.sql` against the pre-upgrade
  exported schema. Synthetic fixtures verify preservation of legacy preferences
  and delivery records, all three provider suppression reasons, ordinary opt-outs,
  enabled accounts, protected suppression fields, authenticated account upsert,
  own-row isolation, service-role claim access, and prevention of a second active
  claim. The test rolls back its changes.
- Ran the existing notification and account-preference application tests:
  70 tests passed across 10 files.
- After the remote push, verified that all 45 migration versions match and no
  migrations remain pending. A fresh schema-only export is saved as
  `.gstack/notification-audit/remote-public-schema-after.sql`; all ten targeted
  schema checks passed, including retention of the legacy table and column.

The local environment used the image's Auth schema and PostGIS plus minimal
Storage table fixtures needed by the repository's storage policies. This verifies
the application migration sequence, not a complete hosted Auth/Storage deployment
or real email delivery. It does not measure migration duration on production data.

## Next rollout steps

1. Keep the existing shared database for the current development phase. Use
   designated test accounts and consistent test-recipient allowlists across
   deployments, with one scheduled notification worker. Do not add separate
   hosting or notification environment-partitioning code for this phase.
2. Verify the CLI target with `npx supabase projects list`. Do not assume the Git
   branch changes the Supabase CLI target: it remains the shared database.
3. The approved database migration is complete. Commit the restored migration,
   migration changes, regression test and documentation so the repository retains
   the history that now matches the shared database. No app deployment or Git push
   was performed as part of the database migration.
4. Deploy the staging app and verify real booking notifications, manual queue
   draining, Resend feedback and allowlist behavior using staging test accounts.
5. Before production cutover, inspect legacy deliveries grouped by status:

   ```sql
   select status, count(*)
   from public.notification_deliveries
   group by status;
   ```

   The migration preserves legacy delivery logs but does not transfer queued or
   failed legacy messages into the new outbox. Drain or explicitly reconcile that
   backlog. Coordinate the legacy worker/webhook switch so new legacy suppression
   decisions do not arrive after the one-time backfill has run.
6. Before serving real customers, review database isolation, recovery coverage,
   recipient policy, and the complete migration/code release together. The
   current shared-development setup should not be mistaken for isolated staging.

The legacy backlog counts have not been verified. An attempted aggregate-only
read stopped before connecting because the local `.env.local` database URL did
not match the audited shared project. Do not repurpose local credentials without
checking which environment they target.
