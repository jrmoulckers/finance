-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260330000004_report_generation_enhancements
-- Description: Add export format tracking and performance indexes for report generation
-- Issues: #1109
--
-- Enhancements:
--   - export_format column on report_configs for last export format used
--   - Performance index for date-range transaction queries
--   - Scheduled report execution tracking
--
-- DOWN migration: services/api/supabase/migrations/down/20260330000004_report_generation_enhancements.down.sql

-- =============================================================================
-- UP
-- =============================================================================

-- Track preferred export format per report config.
ALTER TABLE report_configs
    ADD COLUMN IF NOT EXISTS export_format TEXT NOT NULL DEFAULT 'json'
    CHECK (export_format IN ('json', 'csv', 'pdf', 'text'));

COMMENT ON COLUMN report_configs.export_format IS
    'Preferred export format for this report config. json (default), csv, pdf, or text.';

-- Performance index for date-range transaction queries.
-- Supports queries like: WHERE household_id = X AND date >= Y AND date <= Z
CREATE INDEX IF NOT EXISTS idx_transactions_household_date_range
    ON transactions (household_id, date)
    WHERE deleted_at IS NULL;

-- Performance index for category-filtered transaction queries.
CREATE INDEX IF NOT EXISTS idx_transactions_household_category_date
    ON transactions (household_id, category_id, date)
    WHERE deleted_at IS NULL;

-- Execution count for scheduled reports.
ALTER TABLE scheduled_reports
    ADD COLUMN IF NOT EXISTS execution_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN scheduled_reports.execution_count IS
    'Number of times this scheduled report has been executed.';
