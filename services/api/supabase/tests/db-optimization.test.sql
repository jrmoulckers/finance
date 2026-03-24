-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Database Performance Optimization Tests
-- =============================================================================
-- Validates that performance indexes and automated maintenance functions from
-- migrations 20260324000002 and 20260324000003 are correctly installed.
--
-- Prerequisites:
--   - Local Supabase running: supabase start
--   - Migrations applied:     supabase db reset  (or supabase migration up)
--
-- Usage:
--   psql postgresql://postgres:postgres@localhost:54322/postgres \
--        -f supabase/tests/db-optimization.test.sql
--
-- Exit codes:
--   0 = all tests passed
--   3 = one or more tests failed (via \set ON_ERROR_STOP)
--
-- Issues: #686
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- Use a transaction so all test state is rolled back automatically.
BEGIN;

-- Display a banner
DO $$ BEGIN RAISE NOTICE ''; END $$;
DO $$ BEGIN RAISE NOTICE '=== Database Performance Optimization Tests ==='; END $$;
DO $$ BEGIN RAISE NOTICE ''; END $$;

-- =============================================================================
-- Test 1: Transaction indexes exist
-- =============================================================================
-- The transactions table is the highest-volume table. These composite/partial
-- indexes optimize the most common query patterns: account listings, household
-- views, category reports, type filtering, sync polling, and recurring queries.

DO $$
DECLARE
    missing TEXT[];
    required_indexes TEXT[] := ARRAY[
        'idx_transactions_account_date',
        'idx_transactions_household_date',
        'idx_transactions_category',
        'idx_transactions_type_date',
        'idx_transactions_sync',
        'idx_transactions_recurring'
    ];
    idx TEXT;
BEGIN
    missing := '{}';

    FOREACH idx IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = idx
        ) THEN
            missing := array_append(missing, idx);
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 1: Missing transaction indexes: %', missing;
    END IF;

    RAISE NOTICE 'PASS Test 1: All transaction indexes exist (6/6)';
END $$;

-- =============================================================================
-- Test 2: Account indexes exist
-- =============================================================================
-- Account indexes support household listings, type filtering, and sync polling.

DO $$
DECLARE
    missing TEXT[];
    required_indexes TEXT[] := ARRAY[
        'idx_accounts_household',
        'idx_accounts_type',
        'idx_accounts_sync'
    ];
    idx TEXT;
BEGIN
    missing := '{}';

    FOREACH idx IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = idx
        ) THEN
            missing := array_append(missing, idx);
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 2: Missing account indexes: %', missing;
    END IF;

    RAISE NOTICE 'PASS Test 2: All account indexes exist (3/3)';
END $$;

-- =============================================================================
-- Test 3: Budget and goal indexes exist
-- =============================================================================
-- Budget indexes support period-based listings and category lookups.
-- Goal indexes support household goal tracking with deadline sorting.

DO $$
DECLARE
    missing TEXT[];
    required_indexes TEXT[] := ARRAY[
        'idx_budgets_household_period',
        'idx_budgets_category',
        'idx_goals_household'
    ];
    idx TEXT;
BEGIN
    missing := '{}';

    FOREACH idx IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = idx
        ) THEN
            missing := array_append(missing, idx);
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 3: Missing budget/goal indexes: %', missing;
    END IF;

    RAISE NOTICE 'PASS Test 3: All budget and goal indexes exist (3/3)';
END $$;

-- =============================================================================
-- Test 4: Category and household member indexes exist
-- =============================================================================
-- Category indexes support the parent/child tree structure.
-- Household member indexes are critical for RLS performance (auth.household_ids).

DO $$
DECLARE
    missing TEXT[];
    required_indexes TEXT[] := ARRAY[
        'idx_categories_household',
        'idx_household_members_user',
        'idx_household_members_household'
    ];
    idx TEXT;
BEGIN
    missing := '{}';

    FOREACH idx IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = idx
        ) THEN
            missing := array_append(missing, idx);
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 4: Missing category/member indexes: %', missing;
    END IF;

    RAISE NOTICE 'PASS Test 4: All category and household member indexes exist (3/3)';
END $$;

-- =============================================================================
-- Test 5: Audit log indexes exist
-- =============================================================================
-- Audit log indexes support user history, entity trail, and action filtering.

DO $$
DECLARE
    missing TEXT[];
    required_indexes TEXT[] := ARRAY[
        'idx_audit_log_user_time',
        'idx_audit_log_entity',
        'idx_audit_log_action_time'
    ];
    idx TEXT;
BEGIN
    missing := '{}';

    FOREACH idx IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = idx
        ) THEN
            missing := array_append(missing, idx);
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 5: Missing audit log indexes: %', missing;
    END IF;

    RAISE NOTICE 'PASS Test 5: All audit log indexes exist (3/3)';
END $$;

-- =============================================================================
-- Test 6: Rate limit and sync health indexes exist
-- =============================================================================
-- Rate limit index supports periodic cleanup of expired windows.
-- Sync health index supports per-user sync history queries.

DO $$
DECLARE
    missing TEXT[];
    required_indexes TEXT[] := ARRAY[
        'idx_rate_limits_window_start',
        'idx_sync_health_user_time'
    ];
    idx TEXT;
BEGIN
    missing := '{}';

    FOREACH idx IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = idx
        ) THEN
            missing := array_append(missing, idx);
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 6: Missing rate limit/sync health indexes: %', missing;
    END IF;

    RAISE NOTICE 'PASS Test 6: Rate limit and sync health indexes exist (2/2)';
END $$;

-- =============================================================================
-- Test 7: Recurring template indexes exist
-- =============================================================================
-- These indexes support the cron-driven transaction generation and household
-- template management views.

DO $$
DECLARE
    missing TEXT[];
    required_indexes TEXT[] := ARRAY[
        'idx_recurring_templates_next_due',
        'idx_recurring_templates_household'
    ];
    idx TEXT;
BEGIN
    missing := '{}';

    FOREACH idx IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = idx
        ) THEN
            missing := array_append(missing, idx);
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 7: Missing recurring template indexes: %', missing;
    END IF;

    RAISE NOTICE 'PASS Test 7: All recurring template indexes exist (2/2)';
END $$;

-- =============================================================================
-- Test 8: cleanup_expired_rate_limits function exists and returns INTEGER
-- =============================================================================
-- Validates the function signature and SECURITY DEFINER attribute.

DO $$
DECLARE
    fn_exists BOOLEAN;
    is_definer BOOLEAN;
    return_type TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'cleanup_expired_rate_limits'
    ) INTO fn_exists;

    IF NOT fn_exists THEN
        RAISE EXCEPTION 'FAIL Test 8: cleanup_expired_rate_limits() does not exist';
    END IF;

    SELECT p.prosecdef, pg_get_function_result(p.oid)
    INTO is_definer, return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_expired_rate_limits';

    IF NOT is_definer THEN
        RAISE EXCEPTION 'FAIL Test 8: cleanup_expired_rate_limits is not SECURITY DEFINER';
    END IF;

    IF return_type != 'integer' THEN
        RAISE EXCEPTION 'FAIL Test 8: cleanup_expired_rate_limits returns % (expected integer)', return_type;
    END IF;

    RAISE NOTICE 'PASS Test 8: cleanup_expired_rate_limits exists (SECURITY DEFINER, returns INTEGER)';
END $$;

-- =============================================================================
-- Test 9: cleanup_expired_webauthn_challenges function exists
-- =============================================================================

DO $$
DECLARE
    fn_exists BOOLEAN;
    is_definer BOOLEAN;
    return_type TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'cleanup_expired_webauthn_challenges'
    ) INTO fn_exists;

    IF NOT fn_exists THEN
        RAISE EXCEPTION 'FAIL Test 9: cleanup_expired_webauthn_challenges() does not exist';
    END IF;

    SELECT p.prosecdef, pg_get_function_result(p.oid)
    INTO is_definer, return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_expired_webauthn_challenges';

    IF NOT is_definer THEN
        RAISE EXCEPTION 'FAIL Test 9: cleanup_expired_webauthn_challenges is not SECURITY DEFINER';
    END IF;

    IF return_type != 'integer' THEN
        RAISE EXCEPTION 'FAIL Test 9: returns % (expected integer)', return_type;
    END IF;

    RAISE NOTICE 'PASS Test 9: cleanup_expired_webauthn_challenges exists (SECURITY DEFINER, returns INTEGER)';
END $$;

-- =============================================================================
-- Test 10: cleanup_old_sync_health_logs function exists
-- =============================================================================

DO $$
DECLARE
    fn_exists BOOLEAN;
    is_definer BOOLEAN;
    return_type TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'cleanup_old_sync_health_logs'
    ) INTO fn_exists;

    IF NOT fn_exists THEN
        RAISE EXCEPTION 'FAIL Test 10: cleanup_old_sync_health_logs() does not exist';
    END IF;

    SELECT p.prosecdef, pg_get_function_result(p.oid)
    INTO is_definer, return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_old_sync_health_logs';

    IF NOT is_definer THEN
        RAISE EXCEPTION 'FAIL Test 10: cleanup_old_sync_health_logs is not SECURITY DEFINER';
    END IF;

    IF return_type != 'integer' THEN
        RAISE EXCEPTION 'FAIL Test 10: returns % (expected integer)', return_type;
    END IF;

    RAISE NOTICE 'PASS Test 10: cleanup_old_sync_health_logs exists (SECURITY DEFINER, returns INTEGER)';
END $$;

-- =============================================================================
-- Test 11: cleanup_expired_invitations function exists
-- =============================================================================

DO $$
DECLARE
    fn_exists BOOLEAN;
    is_definer BOOLEAN;
    return_type TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'cleanup_expired_invitations'
    ) INTO fn_exists;

    IF NOT fn_exists THEN
        RAISE EXCEPTION 'FAIL Test 11: cleanup_expired_invitations() does not exist';
    END IF;

    SELECT p.prosecdef, pg_get_function_result(p.oid)
    INTO is_definer, return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_expired_invitations';

    IF NOT is_definer THEN
        RAISE EXCEPTION 'FAIL Test 11: cleanup_expired_invitations is not SECURITY DEFINER';
    END IF;

    IF return_type != 'integer' THEN
        RAISE EXCEPTION 'FAIL Test 11: returns % (expected integer)', return_type;
    END IF;

    RAISE NOTICE 'PASS Test 11: cleanup_expired_invitations exists (SECURITY DEFINER, returns INTEGER)';
END $$;

-- =============================================================================
-- Test 12: run_all_maintenance function exists and returns JSONB
-- =============================================================================

DO $$
DECLARE
    fn_exists BOOLEAN;
    is_definer BOOLEAN;
    return_type TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'run_all_maintenance'
    ) INTO fn_exists;

    IF NOT fn_exists THEN
        RAISE EXCEPTION 'FAIL Test 12: run_all_maintenance() does not exist';
    END IF;

    SELECT p.prosecdef, pg_get_function_result(p.oid)
    INTO is_definer, return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'run_all_maintenance';

    IF NOT is_definer THEN
        RAISE EXCEPTION 'FAIL Test 12: run_all_maintenance is not SECURITY DEFINER';
    END IF;

    IF return_type != 'jsonb' THEN
        RAISE EXCEPTION 'FAIL Test 12: run_all_maintenance returns % (expected jsonb)', return_type;
    END IF;

    RAISE NOTICE 'PASS Test 12: run_all_maintenance exists (SECURITY DEFINER, returns JSONB)';
END $$;

-- =============================================================================
-- Test 13: vacuum_analyze_tables function exists
-- =============================================================================

DO $$
DECLARE
    fn_exists BOOLEAN;
    is_definer BOOLEAN;
    return_type TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'vacuum_analyze_tables'
    ) INTO fn_exists;

    IF NOT fn_exists THEN
        RAISE EXCEPTION 'FAIL Test 13: vacuum_analyze_tables() does not exist';
    END IF;

    SELECT p.prosecdef, pg_get_function_result(p.oid)
    INTO is_definer, return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'vacuum_analyze_tables';

    IF NOT is_definer THEN
        RAISE EXCEPTION 'FAIL Test 13: vacuum_analyze_tables is not SECURITY DEFINER';
    END IF;

    IF return_type != 'text' THEN
        RAISE EXCEPTION 'FAIL Test 13: vacuum_analyze_tables returns % (expected text)', return_type;
    END IF;

    RAISE NOTICE 'PASS Test 13: vacuum_analyze_tables exists (SECURITY DEFINER, returns TEXT)';
END $$;

-- =============================================================================
-- Summary
-- =============================================================================

ROLLBACK;

DO $$ BEGIN RAISE NOTICE ''; END $$;
DO $$ BEGIN RAISE NOTICE '=== All database optimization tests passed (13/13) ==='; END $$;
DO $$ BEGIN RAISE NOTICE ''; END $$;
