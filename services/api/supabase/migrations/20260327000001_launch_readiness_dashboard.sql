-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260327000001_launch_readiness_dashboard
-- Description: Materialized view and functions for launch readiness dashboard
-- Issues: #894
--
-- Adds:
--   1. launch_readiness_checks — materialized view aggregating system health
--   2. refresh_launch_readiness() — function to refresh the materialized view
--   3. get_launch_readiness() — function returning full readiness report
--
-- These are service_role-only: never exposed to end users.
-- NEVER includes raw financial data, user emails, or PII.
--
-- DOWN migration: at the bottom and in down/ directory.

-- =============================================================================
-- 1. Materialized view: launch_readiness_checks
-- =============================================================================
-- Aggregates key system metrics into a single queryable snapshot.
-- Refreshed on demand by the Edge Function or a cron job.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.launch_readiness_checks AS
SELECT
    -- RLS coverage: count tables with RLS enabled vs total
    (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true)
        AS tables_with_rls,
    (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')
        AS total_public_tables,

    -- Core table existence checks
    (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'))
        AS has_users_table,
    (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'households'))
        AS has_households_table,
    (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transactions'))
        AS has_transactions_table,
    (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounts'))
        AS has_accounts_table,
    (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'budgets'))
        AS has_budgets_table,
    (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'goals'))
        AS has_goals_table,
    (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'categories'))
        AS has_categories_table,
    (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_log'))
        AS has_audit_log_table,

    -- Record counts (active only, no PII)
    (SELECT count(*) FROM users WHERE deleted_at IS NULL) AS active_users,
    (SELECT count(*) FROM households WHERE deleted_at IS NULL) AS active_households,
    (SELECT count(*) FROM accounts WHERE deleted_at IS NULL) AS active_accounts,
    (SELECT count(*) FROM transactions WHERE deleted_at IS NULL) AS total_transactions,
    (SELECT count(*) FROM budgets WHERE deleted_at IS NULL) AS active_budgets,
    (SELECT count(*) FROM goals WHERE deleted_at IS NULL) AS active_goals,

    -- Sync health (last 24h)
    (SELECT count(*) FROM sync_health_logs
     WHERE created_at > now() - INTERVAL '24 hours') AS sync_reports_24h,
    (SELECT count(*) FROM sync_health_logs
     WHERE created_at > now() - INTERVAL '24 hours' AND sync_status = 'failure') AS sync_failures_24h,
    (SELECT COALESCE(avg(sync_duration_ms), 0)::INTEGER FROM sync_health_logs
     WHERE created_at > now() - INTERVAL '24 hours') AS avg_sync_duration_ms_24h,

    -- Rate limit activity (last 1h)
    (SELECT count(*) FROM rate_limits
     WHERE window_start > now() - INTERVAL '1 hour') AS rate_limit_entries_1h,

    -- Index health: count of indexes on public tables
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public') AS total_indexes,

    -- Snapshot timestamp
    now() AS snapshot_at
WITH NO DATA;

-- Populate initial data
REFRESH MATERIALIZED VIEW public.launch_readiness_checks;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_launch_readiness_singleton
    ON public.launch_readiness_checks (snapshot_at);

COMMENT ON MATERIALIZED VIEW public.launch_readiness_checks IS
    'Aggregated system health snapshot for launch readiness monitoring. '
    'Refresh via refresh_launch_readiness(). NEVER contains PII or financial data.';

-- =============================================================================
-- 2. Function: refresh_launch_readiness()
-- =============================================================================
-- Concurrently refreshes the materialized view. Safe to call from Edge Functions.

CREATE OR REPLACE FUNCTION public.refresh_launch_readiness()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.launch_readiness_checks;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_launch_readiness() TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_launch_readiness() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_launch_readiness() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_launch_readiness() FROM authenticated;

COMMENT ON FUNCTION public.refresh_launch_readiness() IS
    'Refresh the launch_readiness_checks materialized view concurrently. '
    'Service_role only.';

-- =============================================================================
-- 3. Function: get_launch_readiness()
-- =============================================================================
-- Returns a comprehensive JSONB report with readiness status, checks, and metrics.

CREATE OR REPLACE FUNCTION public.get_launch_readiness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row RECORD;
    v_rls_pct NUMERIC;
    v_checks jsonb := '[]'::jsonb;
    v_all_passed BOOLEAN := true;
    v_sync_error_rate NUMERIC;
BEGIN
    -- Refresh before reading
    PERFORM refresh_launch_readiness();

    SELECT * INTO v_row FROM launch_readiness_checks LIMIT 1;

    IF v_row IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'No readiness data available',
            'generated_at', now()
        );
    END IF;

    -- RLS coverage check
    v_rls_pct := CASE WHEN v_row.total_public_tables > 0
        THEN (v_row.tables_with_rls::NUMERIC / v_row.total_public_tables * 100)
        ELSE 0 END;

    v_checks := v_checks || jsonb_build_object(
        'name', 'rls_coverage',
        'passed', v_rls_pct >= 90,
        'value', round(v_rls_pct, 1),
        'unit', 'percent',
        'description', 'Percentage of public tables with RLS enabled'
    );
    IF v_rls_pct < 90 THEN v_all_passed := false; END IF;

    -- Core tables check
    v_checks := v_checks || jsonb_build_object(
        'name', 'core_tables_exist',
        'passed', (v_row.has_users_table AND v_row.has_households_table
                   AND v_row.has_transactions_table AND v_row.has_accounts_table
                   AND v_row.has_budgets_table AND v_row.has_goals_table
                   AND v_row.has_categories_table AND v_row.has_audit_log_table),
        'description', 'All core schema tables present'
    );
    IF NOT (v_row.has_users_table AND v_row.has_households_table
            AND v_row.has_transactions_table AND v_row.has_accounts_table) THEN
        v_all_passed := false;
    END IF;

    -- Sync health check
    v_sync_error_rate := CASE WHEN v_row.sync_reports_24h > 0
        THEN (v_row.sync_failures_24h::NUMERIC / v_row.sync_reports_24h * 100)
        ELSE 0 END;

    v_checks := v_checks || jsonb_build_object(
        'name', 'sync_error_rate',
        'passed', v_sync_error_rate < 5,
        'value', round(v_sync_error_rate, 2),
        'unit', 'percent',
        'description', 'Sync failure rate under 5% in last 24 hours'
    );
    IF v_sync_error_rate >= 5 THEN v_all_passed := false; END IF;

    -- Sync performance check
    v_checks := v_checks || jsonb_build_object(
        'name', 'sync_performance',
        'passed', v_row.avg_sync_duration_ms_24h < 5000,
        'value', v_row.avg_sync_duration_ms_24h,
        'unit', 'ms',
        'description', 'Average sync duration under 5 seconds'
    );
    IF v_row.avg_sync_duration_ms_24h >= 5000 THEN v_all_passed := false; END IF;

    -- Index coverage check
    v_checks := v_checks || jsonb_build_object(
        'name', 'index_coverage',
        'passed', v_row.total_indexes >= 20,
        'value', v_row.total_indexes,
        'description', 'Sufficient indexes for production queries'
    );
    IF v_row.total_indexes < 20 THEN v_all_passed := false; END IF;

    RETURN jsonb_build_object(
        'status', CASE WHEN v_all_passed THEN 'ready' ELSE 'not_ready' END,
        'checks', v_checks,
        'statistics', jsonb_build_object(
            'active_users', v_row.active_users,
            'active_households', v_row.active_households,
            'active_accounts', v_row.active_accounts,
            'total_transactions', v_row.total_transactions,
            'active_budgets', v_row.active_budgets,
            'active_goals', v_row.active_goals,
            'sync_reports_24h', v_row.sync_reports_24h,
            'rate_limit_entries_1h', v_row.rate_limit_entries_1h
        ),
        'generated_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_launch_readiness() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_launch_readiness() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_launch_readiness() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_launch_readiness() FROM authenticated;

COMMENT ON FUNCTION public.get_launch_readiness() IS
    'Returns a comprehensive launch readiness report as JSONB. '
    'Includes pass/fail checks, aggregate statistics, and system status. '
    'Service_role only. NEVER returns PII or financial data.';

-- =============================================================================
-- DOWN (to revert this migration, run the following statements)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.get_launch_readiness();
-- DROP FUNCTION IF EXISTS public.refresh_launch_readiness();
-- DROP MATERIALIZED VIEW IF EXISTS public.launch_readiness_checks;
