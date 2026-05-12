-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260330000004_report_generation_enhancements
-- Description: Revert report generation export format and performance indexes
-- Issues: #1109

-- Drop new indexes
DROP INDEX IF EXISTS idx_transactions_household_category_date;
DROP INDEX IF EXISTS idx_transactions_household_date_range;

-- Remove new columns
ALTER TABLE scheduled_reports DROP COLUMN IF EXISTS execution_count;
ALTER TABLE report_configs DROP COLUMN IF EXISTS export_format;
