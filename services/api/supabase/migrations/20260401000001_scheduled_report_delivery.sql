-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260401000001_scheduled_report_delivery
-- Description: Server-side delivery tracking for scheduled reports — recipients,
--              pause/resume, retry cursors, unsubscribe tokens, and a per-attempt
--              delivery audit trail.
-- Issues: #2626 (follow-up to #2253)
--
-- Background:
--   #2253 shipped local scheduled-report run previews plus CSV/HTML export
--   package helpers (apps/web/src/lib/reports/scheduled-report-exports.ts).
--   The schedule-definition tables (report_configs, scheduled_reports) already
--   exist from 20260328000005_report_generation. This migration adds the
--   delivery-side state the deferred backend work needs:
--     - recipients + unsubscribe token (delivery targeting / preferences)
--     - pause/resume + retry cursor (failure handling)
--     - a delivery-attempt audit table (retry/failure tracking, observability)
--
-- Security:
--   - RLS enabled — household-scoped read access for the audit table.
--   - Inserts/updates to the delivery audit table are service-role only
--     (written by the process-scheduled-reports Edge Function), matching the
--     notification_log pattern.
--   - No sensitive report data is stored in the audit rows (counts only).
--
-- DOWN migration: services/api/supabase/migrations/down/20260401000001_scheduled_report_delivery.down.sql

-- =============================================================================
-- UP
-- =============================================================================

-- ---------------------------------------------------------------------------
-- scheduled_reports: delivery + retry columns
-- ---------------------------------------------------------------------------

ALTER TABLE scheduled_reports
    ADD COLUMN IF NOT EXISTS recipients TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE scheduled_reports
    ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE scheduled_reports
    ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE scheduled_reports
    ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;

ALTER TABLE scheduled_reports
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

ALTER TABLE scheduled_reports
    ADD COLUMN IF NOT EXISTS unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN scheduled_reports.recipients IS
    'Email recipients for this schedule. Empty array = export-only (no delivery).';
COMMENT ON COLUMN scheduled_reports.is_paused IS
    'When true, the scheduler skips this report without deleting the definition (pause/resume).';
COMMENT ON COLUMN scheduled_reports.retry_count IS
    'Consecutive failed delivery attempts for the current run. Reset to 0 on success.';
COMMENT ON COLUMN scheduled_reports.max_retries IS
    'Maximum consecutive retries before the scheduler gives up and marks the run failed.';
COMMENT ON COLUMN scheduled_reports.next_retry_at IS
    'When set, the earliest time the scheduler should retry a previously failed delivery.';
COMMENT ON COLUMN scheduled_reports.unsubscribe_token IS
    'Opaque token embedded in delivery emails so recipients can unsubscribe without auth.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_reports_unsubscribe_token
    ON scheduled_reports (unsubscribe_token);

-- ---------------------------------------------------------------------------
-- scheduled_report_deliveries: per-attempt audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scheduled_report_deliveries (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_report_id  UUID        NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
    household_id         UUID        NOT NULL REFERENCES households(id),
    status               TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'rendered', 'delivered', 'skipped_no_smtp', 'failed')),
    attempt              INTEGER     NOT NULL DEFAULT 1,
    recipient_count      INTEGER     NOT NULL DEFAULT 0,
    -- Diagnostic error class only — NEVER a recipient address or report content.
    error_message        TEXT,
    rendered_at          TIMESTAMPTZ,
    delivered_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_report_deliveries_report
    ON scheduled_report_deliveries (scheduled_report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_report_deliveries_household
    ON scheduled_report_deliveries (household_id, created_at DESC);

COMMENT ON TABLE scheduled_report_deliveries IS
    'Per-attempt delivery audit trail for scheduled reports. Written by the process-scheduled-reports Edge Function (service role). Stores counts and status only — no sensitive report data or recipient addresses.';

-- =============================================================================
-- Enable RLS
-- =============================================================================

ALTER TABLE scheduled_report_deliveries ENABLE ROW LEVEL SECURITY;

-- Household members may read their own delivery history (observability), but
-- only the service role writes rows (the scheduler runs server-to-server).
CREATE POLICY scheduled_report_deliveries_select ON scheduled_report_deliveries
    FOR SELECT
    USING (household_id = ANY(public.household_ids()));
