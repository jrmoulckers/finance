<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Scheduled Reports — Backend Scheduler & Email Delivery

Tracks the backend delivery pipeline for scheduled reports (issue #2626,
follow-up to #2253). The client-side run preview and CSV/HTML export package
helpers already live in
`apps/web/src/lib/reports/scheduled-report-exports.ts`; this document covers the
server-side scheduling, persistence, and delivery that #2626 deferred.

## Components

| Concern                    | Where                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Schedule definitions       | `scheduled_reports` (created in `20260328000005_report_generation.sql`)                |
| Delivery targeting & retry | `20260401000001_scheduled_report_delivery.sql` (recipients, pause, retry, unsubscribe) |
| Per-attempt audit trail    | `scheduled_report_deliveries` table                                                    |
| Next-run / retry math      | `functions/_shared/scheduled-report-schedule.ts` (pure, unit-tested)                   |
| Scheduler + email delivery | `functions/process-scheduled-reports/index.ts` (cron-authenticated)                    |
| Email transport            | `functions/_shared/notification.ts` `sendEmail()` (SMTP, degrades gracefully)          |

## How it runs

1. A cron scheduler POSTs to `process-scheduled-reports` on an interval
   (recommended every 15 minutes), authenticated with the `CRON_SECRET`
   shared secret.
2. The function selects schedules that are **due** — `is_active = true`,
   `is_paused = false`, `deleted_at IS NULL`, and `next_run_at <= now()`.
3. For each due schedule it renders a concise HTML/text summary (no sensitive
   figures or signed URLs are embedded — the report itself is viewed in-app),
   delivers to each recipient via `sendEmail()`, and records a row in
   `scheduled_report_deliveries`.
4. It then advances the cursor:
   - **delivered / export-only** → `next_run_at` = next cron match, `retry_count`
     reset to 0.
   - **failed** → `next_run_at` re-armed at an exponential backoff time
     (5m, 10m, 20m … capped at 1h) until `max_retries`, then it skips forward to
     the next scheduled run.
   - **no SMTP configured** → recorded as `skipped_no_smtp` and advanced like a
     successful run (so the pipeline is exercised without an email relay).

### Pause / resume & unsubscribe

- **Pause/resume**: set `scheduled_reports.is_paused`. Paused schedules are
  skipped without losing their definition or history.
- **Unsubscribe**: each schedule carries an opaque `unsubscribe_token`; embed it
  in delivery emails so recipients can opt out without authenticating. Wiring
  the unsubscribe endpoint is future work.

## Cron registration (pg_cron example)

```sql
SELECT cron.schedule(
  'process-scheduled-reports',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/process-scheduled-reports',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  )$$
);
```

## Needs Human Action

The following require human-held secrets or deployed-infra changes and **cannot
be completed by an agent**:

1. **SMTP / transactional email credentials.** Set `SMTP_HOST`, `SMTP_PORT`, and
   `SMTP_FROM` (and any relay auth) in the deployed Supabase Edge Function
   environment. Until these are set, deliveries are recorded as
   `skipped_no_smtp` and no email is sent.
2. **Register the cron job.** Enable `pg_cron` + `pg_net` and register the
   schedule above (or wire an external scheduler) with the real `CRON_SECRET`.
3. **Verify `CRON_SECRET`** is provisioned in the Edge Function environment.

Once (1)–(3) are in place, recurring delivery is production-ready; no further
code changes are required to start sending.
