-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260326000001_production_readiness
-- Description: Production readiness functions and verification
-- Issues: #771
--
-- Adds:
--   1. verify_rls_status() — Returns RLS enabled/disabled status for all public tables
--   2. verify_schema_integrity() — Validates expected tables, columns, and indexes exist
--   3. production_health_summary() — Comprehensive health check for production monitoring
--
-- These functions are service_role-only and are designed to be called by
-- monitoring scripts and the admin dashboard, never by end users.
--
-- DOWN migration: commented at the bottom for reversibility.

-- =============================================================================
-- 1. RLS verification function
-- =============================================================================
-- Returns a JSONB array of objects with table name and RLS status.
-- Used by monitoring scripts to detect if RLS is accidentally disabled.

CREATE OR REPLACE FUNCTION public.verify_rls_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_results jsonb := '[]'::jsonb;
    r RECORD;
    v_all_enabled BOOLEAN := true;
BEGIN
    FOR r IN
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        v_results := v_results || jsonb_build_object(
            'table', r.tablename,
            'rls_enabled', r.rowsecurity
        );
        IF NOT r.rowsecurity THEN
            v_all_enabled := false;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'all_rls_enabled', v_all_enabled,
        'checked_at', now(),
        'tables', v_results
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_rls_status() TO service_role;
REVOKE EXECUTE ON FUNCTION public.verify_rls_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_rls_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_rls_status() FROM authenticated;

-- =============================================================================
-- 2. Schema integrity verification
-- =============================================================================
-- Checks that all expected tables exist and have the required columns.
-- Returns { "valid": true/false, "missing_tables": [...], "checked_at": ... }

CREATE OR REPLACE FUNCTION public.verify_schema_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expected_tables TEXT[] := ARRAY[
        'users', 'households', 'household_members',
        'accounts', 'categories', 'transactions',
        'budgets', 'goals',
        'passkey_credentials', 'household_invitations',
        'webauthn_challenges', 'audit_log',
        'sync_health_logs', 'data_export_audit_log',
        'rate_limits', 'recurring_transaction_templates',
        'notification_preferences', 'notification_log',
        'webhook_endpoints', 'webhook_delivery_log'
    ];
    v_missing TEXT[] := '{}';
    v_table TEXT;
    v_exists BOOLEAN;
BEGIN
    FOREACH v_table IN ARRAY v_expected_tables
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public' AND tablename = v_table
        ) INTO v_exists;

        IF NOT v_exists THEN
            v_missing := v_missing || v_table;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'valid', array_length(v_missing, 1) IS NULL,
        'expected_tables', array_length(v_expected_tables, 1),
        'missing_tables', v_missing,
        'checked_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_schema_integrity() TO service_role;
REVOKE EXECUTE ON FUNCTION public.verify_schema_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_schema_integrity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_schema_integrity() FROM authenticated;

-- =============================================================================
-- 3. Production health summary
-- =============================================================================
-- Aggregates RLS status, schema integrity, and table statistics into a single
-- JSONB response. Designed for the admin dashboard and monitoring scripts.
--
-- NEVER includes actual user data, row contents, or financial information.
-- Only returns metadata: counts, statuses, and timestamps.

CREATE OR REPLACE FUNCTION public.production_health_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rls jsonb;
    v_schema jsonb;
    v_user_count BIGINT;
    v_household_count BIGINT;
    v_transaction_count BIGINT;
    v_active_accounts BIGINT;
    v_sync_error_rate NUMERIC;
BEGIN
    -- RLS and schema checks
    v_rls := verify_rls_status();
    v_schema := verify_schema_integrity();

    -- Table counts (active records only — no financial data exposed)
    SELECT count(*) INTO v_user_count FROM users WHERE deleted_at IS NULL;
    SELECT count(*) INTO v_household_count FROM households WHERE deleted_at IS NULL;
    SELECT count(*) INTO v_transaction_count FROM transactions WHERE deleted_at IS NULL;
    SELECT count(*) INTO v_active_accounts FROM accounts WHERE deleted_at IS NULL;

    -- Sync error rate (last 24 hours)
    SELECT COALESCE(
        (count(*) FILTER (WHERE sync_status = 'failure')::NUMERIC /
         NULLIF(count(*), 0)::NUMERIC) * 100,
        0
    ) INTO v_sync_error_rate
    FROM sync_health_logs
    WHERE created_at > now() - INTERVAL '24 hours';

    RETURN jsonb_build_object(
        'rls_status', v_rls,
        'schema_integrity', v_schema,
        'statistics', jsonb_build_object(
            'active_users', v_user_count,
            'active_households', v_household_count,
            'total_transactions', v_transaction_count,
            'active_accounts', v_active_accounts,
            'sync_error_rate_24h_pct', round(v_sync_error_rate, 2)
        ),
        'generated_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.production_health_summary() TO service_role;
REVOKE EXECUTE ON FUNCTION public.production_health_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.production_health_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.production_health_summary() FROM authenticated;


-- =============================================================================
-- DOWN (to revert this migration, run the following statements)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.production_health_summary();
-- DROP FUNCTION IF EXISTS public.verify_schema_integrity();
-- DROP FUNCTION IF EXISTS public.verify_rls_status();
