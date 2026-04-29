-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260328000003_report_generation
-- Description: Drop report_configs and scheduled_reports tables
-- Issues: #sprint-8

-- Drop scheduled_reports first (FK dependency)
DROP POLICY IF EXISTS scheduled_reports_delete ON scheduled_reports;
DROP POLICY IF EXISTS scheduled_reports_update ON scheduled_reports;
DROP POLICY IF EXISTS scheduled_reports_insert ON scheduled_reports;
DROP POLICY IF EXISTS scheduled_reports_select ON scheduled_reports;
ALTER TABLE scheduled_reports DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_scheduled_reports_updated_at ON scheduled_reports;
DROP TABLE IF EXISTS scheduled_reports;

-- Drop report_configs
DROP POLICY IF EXISTS report_configs_delete ON report_configs;
DROP POLICY IF EXISTS report_configs_update ON report_configs;
DROP POLICY IF EXISTS report_configs_insert ON report_configs;
DROP POLICY IF EXISTS report_configs_select ON report_configs;
ALTER TABLE report_configs DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_report_configs_updated_at ON report_configs;
DROP TABLE IF EXISTS report_configs;
