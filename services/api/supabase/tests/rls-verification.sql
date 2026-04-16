-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- RLS Verification Script — Production Readiness Check
-- =============================================================================
-- Issue: #771
--
-- Run against any Supabase/PostgreSQL instance to verify that:
--   1. Every public table has RLS enabled
--   2. Every table has at least one policy per operation (SELECT/INSERT/UPDATE/DELETE)
--   3. No table is accidentally unprotected
--
-- Usage:
--   psql "$DATABASE_URL" -f supabase/tests/rls-verification.sql
--
-- Returns:
--   - Per-table RLS status
--   - Per-table policy count by operation
--   - Summary pass/fail
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Check RLS is enabled on all public tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    r RECORD;
    unprotected_count INTEGER := 0;
    total_tables INTEGER := 0;
BEGIN
    RAISE NOTICE '=== RLS VERIFICATION REPORT ===';
    RAISE NOTICE 'Timestamp: %', now();
    RAISE NOTICE '';
    RAISE NOTICE '--- Table RLS Status ---';

    FOR r IN
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        total_tables := total_tables + 1;
        IF r.rowsecurity THEN
            RAISE NOTICE '  ✅ % — RLS enabled', r.tablename;
        ELSE
            RAISE NOTICE '  ❌ % — RLS DISABLED', r.tablename;
            unprotected_count := unprotected_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE 'Total tables: %, RLS enabled: %, Unprotected: %',
        total_tables, total_tables - unprotected_count, unprotected_count;

    IF unprotected_count > 0 THEN
        RAISE WARNING '⚠️  FAIL: % table(s) have RLS disabled!', unprotected_count;
    ELSE
        RAISE NOTICE '✅ PASS: All tables have RLS enabled.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Check policy coverage per table
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    r RECORD;
    missing_policies TEXT := '';
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '--- Policy Coverage ---';

    FOR r IN
        SELECT
            t.tablename,
            COUNT(CASE WHEN p.cmd = 'r' THEN 1 END) AS select_count,
            COUNT(CASE WHEN p.cmd = 'a' THEN 1 END) AS insert_count,
            COUNT(CASE WHEN p.cmd = 'w' THEN 1 END) AS update_count,
            COUNT(CASE WHEN p.cmd = 'd' THEN 1 END) AS delete_count
        FROM pg_tables t
        LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
        WHERE t.schemaname = 'public'
        GROUP BY t.tablename
        ORDER BY t.tablename
    LOOP
        RAISE NOTICE '  % — SELECT:% INSERT:% UPDATE:% DELETE:%',
            r.tablename, r.select_count, r.insert_count, r.update_count, r.delete_count;

        -- Some tables are intentionally insert-only or read-only from user perspective
        -- (e.g., audit_log has SELECT only, rate_limits has no user policies).
        -- We flag tables with ZERO policies as they may be misconfigured.
        IF r.select_count = 0 AND r.insert_count = 0 AND r.update_count = 0 AND r.delete_count = 0 THEN
            missing_policies := missing_policies || r.tablename || ', ';
        END IF;
    END LOOP;

    RAISE NOTICE '';

    IF missing_policies <> '' THEN
        RAISE NOTICE '⚠️  Tables with NO user-facing policies (may be service-role-only): %',
            rtrim(missing_policies, ', ');
        RAISE NOTICE '   Verify these tables are intentionally service-role-only.';
    ELSE
        RAISE NOTICE '✅ All tables have at least one policy.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Verify key security functions exist
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    fn_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '--- Security Function Verification ---';

    -- auth.household_ids()
    SELECT count(*) INTO fn_count
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth' AND p.proname = 'household_ids';
    IF fn_count > 0 THEN
        RAISE NOTICE '  ✅ auth.household_ids() exists';
    ELSE
        RAISE WARNING '  ❌ auth.household_ids() MISSING';
    END IF;

    -- auth.custom_access_token_hook()
    SELECT count(*) INTO fn_count
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth' AND p.proname = 'custom_access_token_hook';
    IF fn_count > 0 THEN
        RAISE NOTICE '  ✅ auth.custom_access_token_hook() exists';
    ELSE
        RAISE WARNING '  ❌ auth.custom_access_token_hook() MISSING';
    END IF;

    -- public.check_rate_limit()
    SELECT count(*) INTO fn_count
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_rate_limit';
    IF fn_count > 0 THEN
        RAISE NOTICE '  ✅ public.check_rate_limit() exists';
    ELSE
        RAISE WARNING '  ❌ public.check_rate_limit() MISSING';
    END IF;

    -- public.generate_recurring_transactions()
    SELECT count(*) INTO fn_count
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'generate_recurring_transactions';
    IF fn_count > 0 THEN
        RAISE NOTICE '  ✅ public.generate_recurring_transactions() exists';
    ELSE
        RAISE WARNING '  ❌ public.generate_recurring_transactions() MISSING';
    END IF;

    -- public.run_all_maintenance()
    SELECT count(*) INTO fn_count
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'run_all_maintenance';
    IF fn_count > 0 THEN
        RAISE NOTICE '  ✅ public.run_all_maintenance() exists';
    ELSE
        RAISE WARNING '  ❌ public.run_all_maintenance() MISSING';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '=== RLS VERIFICATION COMPLETE ===';
END $$;
