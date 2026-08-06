# Notification delivery operations

The notification pipeline stores every message in `notification_events` before delivery. Transactional hooks attempt delivery immediately, while the protected worker claims pending or retryable events. The daily digest route only creates digest events.

## Environment configuration

Use separate Resend credentials, sender addresses, webhook secrets, and cron secrets for every environment. Arbitrary recipients require `EMAIL_FROM` to use a domain verified in Resend.

| Setting | Local | Staging Preview (`staging` branch) | Production |
| --- | --- | --- | --- |
| `APP_ENV` | `local` | `staging` | `production` |
| `NOTIFICATION_TRANSPORT` | `resend` | `resend` | `resend` |
| `NOTIFICATION_DELIVERY_ENABLED` | `true` | `true` | `true` |
| `NOTIFICATION_RECIPIENT_POLICY` | `unrestricted` | `allowlist` | `unrestricted` |
| `NOTIFICATION_EMAIL_ALLOWLIST` | optional | required, comma-separated | optional |
| `RESEND_API_KEY` | local/test key | staging key | production key |
| `EMAIL_FROM` | verified local/test sender | verified staging sender | verified production sender |
| `RESEND_WEBHOOK_SECRET` | local forwarding secret | staging endpoint secret | production endpoint secret |
| `CRON_SECRET` | local secret | staging secret | production secret |

Staging fails closed if the allowlist is missing. All environments reject partial transport configuration. Setting `NOTIFICATION_DELIVERY_ENABLED=false` is the delivery kill switch: hooks still create events, but the worker leaves them queued.

`webhook` is also supported as an explicit transport and requires both `EMAIL_DELIVERY_WEBHOOK_URL` and `EMAIL_DELIVERY_WEBHOOK_SECRET`. The old `STATUS_EMAIL_WEBHOOK_*` and notification publisher variables are no longer used.

For Vercel, define the staging values as branch-specific Preview variables for the `staging` branch. Define production values in the Production environment. Vercel cron invokes only Production deployments, so staging worker runs are manual.

## Initial setup and rollout

1. Apply `supabase/migrations/20260804150000_notification_delivery_reliability.sql` before deploying application code.
2. Verify each sending domain in Resend and create distinct API keys/sender addresses per environment.
3. Configure the Resend webhook at `/api/webhooks/resend/events` for sent, delivered, delayed, failed, bounced, complained, and suppressed feedback.
4. Add branch-specific staging Preview variables and Production variables in Vercel.
5. Add GitHub Actions secrets `PRODUCTION_NOTIFICATION_CRON_URL` (the full `/api/cron/notifications` URL) and `PRODUCTION_CRON_SECRET`, then enable `.github/workflows/notification-worker.yml`.
6. Deploy staging, run preflight, send an allowlisted test, and manually drain the staging worker.
7. Deploy production and run one controlled canary before enabling regular delivery.

## Preflight and tests

The commands load `.env.local` automatically. Never put secrets in command arguments.

```powershell
npm run notifications:check
npm run notifications:test -- --user-id <uuid> --to <email> --event booking_confirmed
$env:CRON_SECRET='<staging secret>'
npm run notifications:drain -- --base-url https://<staging-preview-host>
```

`notifications:check` validates the environment and renders all eight email templates. `notifications:test` creates a real database event and runs it through the same claim and delivery path as production. `notifications:drain` calls the authenticated staging worker without placing the secret in the process arguments.

## Processing and retry behavior

Workers claim rows atomically with `FOR UPDATE SKIP LOCKED`. A claim has a five-minute lease; expired leases can be reclaimed. Completion updates require the matching claim token.

Network errors, HTTP 429, and provider 5xx responses retry. Other provider 4xx responses are terminal. Delivery permits five total attempts with delays of 1, 5, 15, and 60 minutes. Production runs the worker every 15 minutes; the database claim is the final concurrency guard. The notification dedupe key is also the Resend idempotency key.

Structured logs contain environment, event type, notification ID, attempt, outcome, and provider message ID. Recipient addresses, secrets, and rendered bodies are intentionally omitted.

## Database inspection

```sql
select id, event_type, status, attempt_count, next_attempt_at,
       claimed_at, last_attempt_at, status_reason
from notification_events
order by created_at desc
limit 100;

select notification_event_id, provider, provider_event_id, event_type,
       occurred_at, created_at
from email_delivery_events
order by created_at desc
limit 100;

select id, event_type, attempt_count, next_attempt_at, status_reason
from notification_events
where status in ('pending', 'processing', 'failed')
order by next_attempt_at nulls first;
```

## Rollback

1. Set `NOTIFICATION_DELIVERY_ENABLED=false` in the affected environment and redeploy.
2. Disable the GitHub Actions notification worker workflow.
3. Release active claims so queued work remains recoverable:

```sql
update notification_events
set status = 'pending', claim_token = null, claimed_at = null,
    next_attempt_at = now(), status_reason = 'rollback_claim_release'
where status = 'processing';
```

4. Revert application code only after delivery is disabled. Do not delete queued notification rows.
