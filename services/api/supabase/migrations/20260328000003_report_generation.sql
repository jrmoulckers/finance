-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260328000003_report_generation
-- Description: Create report_configs and scheduled_reports tables for report generation service
-- Issues: #sprint-8
--
-- Supports:
--   - User-defined report configurations (date range, categories, accounts, grouping)
--   - Scheduled report generation via cron
--   - Report execution audit trail
--
-- Security:
--   - RLS enabled — household-scoped access
--   - Report queries execute through RLS so users only see their household data
--   - Config stored as JSONB with strict validation in Edge Function
--
-- DOWN migration: services/api/supabase/migrations/down/20260328000003_report_generation.down.sql

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE report_configs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        REFERENCES auth.users(id),
    name                TEXT        NOT NULL,
    report_type         TEXT        NOT NULL DEFAULT 'spending_summary'
        CHECK (report_type IN (
            'spending_summary', 'income_expense', 'category_breakdown',
            'account_balance', 'budget_variance', 'trend_analysis'
        )),
    config              JSONB       NOT NULL DEFAULT '{}',
    last_generated_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_report_configs_household
    ON report_configs (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_report_configs_owner
    ON report_configs (owner_id)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE report_configs IS
    'User-defined report configurations. Stored per household with optional scheduling.';
COMMENT ON COLUMN report_configs.config IS
    'JSONB report configuration: { date_from, date_to, category_ids, account_ids, group_by, currency_code }. Validated in Edge Function.';

-- =============================================================================
-- scheduled_reports
-- =============================================================================

CREATE TABLE scheduled_reports (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_config_id    UUID        NOT NULL REFERENCES report_configs(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        REFERENCES auth.users(id),
    cron_expression     TEXT        NOT NULL,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    next_run_at         TIMESTAMPTZ,
    last_run_at         TIMESTAMPTZ,
    last_run_status     TEXT
        CHECK (last_run_status IS NULL OR last_run_status IN ('success', 'failure', 'running')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_scheduled_reports_household
    ON scheduled_reports (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_scheduled_reports_next_run
    ON scheduled_reports (next_run_at)
    WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX idx_scheduled_reports_config
    ON scheduled_reports (report_config_id)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE scheduled_reports IS
    'Scheduled report execution. Linked to report_configs via FK. Cron expressions drive execution timing.';
COMMENT ON COLUMN scheduled_reports.cron_expression IS
    'Standard 5-field cron expression (minute hour day_of_month month day_of_week).';

-- =============================================================================
-- updated_at triggers
-- =============================================================================

CREATE TRIGGER trg_report_configs_updated_at
    BEFORE UPDATE ON report_configs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_scheduled_reports_updated_at
    BEFORE UPDATE ON scheduled_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Enable RLS
-- =============================================================================

ALTER TABLE report_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies: report_configs
-- =============================================================================

CREATE POLICY report_configs_select ON report_configs
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY report_configs_insert ON report_configs
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY report_configs_update ON report_configs
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY report_configs_delete ON report_configs
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));

-- =============================================================================
-- RLS Policies: scheduled_reports
-- =============================================================================

CREATE POLICY scheduled_reports_select ON scheduled_reports
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY scheduled_reports_insert ON scheduled_reports
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY scheduled_reports_update ON scheduled_reports
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY scheduled_reports_delete ON scheduled_reports
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));
