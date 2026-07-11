-- SPDX-License-Identifier: BUSL-1.1

-- DOWN migration for 20260401000001_scheduled_report_delivery

DROP TABLE IF EXISTS scheduled_report_deliveries;

DROP INDEX IF EXISTS idx_scheduled_reports_unsubscribe_token;

ALTER TABLE scheduled_reports DROP COLUMN IF EXISTS unsubscribe_token;
ALTER TABLE scheduled_reports DROP COLUMN IF EXISTS next_retry_at;
ALTER TABLE scheduled_reports DROP COLUMN IF EXISTS max_retries;
ALTER TABLE scheduled_reports DROP COLUMN IF EXISTS retry_count;
ALTER TABLE scheduled_reports DROP COLUMN IF EXISTS is_paused;
ALTER TABLE scheduled_reports DROP COLUMN IF EXISTS recipients;
