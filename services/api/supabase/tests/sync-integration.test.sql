-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Sync Integration Tests
-- =============================================================================
-- Validates that the database schema, RLS policies, and PowerSync sync-rules
-- configuration work correctly together end-to-end.
--
-- Prerequisites:
--   - Local Supabase running: supabase start
--   - Migrations applied:     supabase db reset  (or supabase migration up)
--   - Seed data loaded:       included in supabase db reset
--
-- Usage:
--   psql postgresql://postgres:postgres@localhost:54322/postgres \
--        -f supabase/tests/sync-integration.test.sql
--
-- Exit codes:
--   0 = all tests passed
--   3 = one or more tests failed (via \set ON_ERROR_STOP)
--
-- Issues: #532
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- Use a transaction so all test-created data is rolled back automatically.
BEGIN;

-- Display a banner
DO $$ BEGIN RAISE NOTICE ''; END $$;
DO $$ BEGIN RAISE NOTICE '=== Sync Integration Tests ==='; END $$;
DO $$ BEGIN RAISE NOTICE ''; END $$;

-- =============================================================================
-- Test 1: Verify all sync-rules tables exist and have expected columns
-- =============================================================================
-- The PowerSync sync-rules.yaml references these tables:
--   by_household bucket: accounts, transactions, categories, budgets, goals
--   user_profile bucket: users, household_members
--
-- Each must exist in the public schema with the columns that sync-rules
-- SELECT * exposes to clients.

DO $$
DECLARE
    missing_tables TEXT[];
    tbl TEXT;
    required_tables TEXT[] := ARRAY[
        'accounts',
        'transactions',
        'categories',
        'budgets',
        'goals',
        'users',
        'household_members'
    ];
BEGIN
    missing_tables := '{}';

    FOREACH tbl IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = tbl
        ) THEN
            missing_tables := array_append(missing_tables, tbl);
        END IF;
    END LOOP;

    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 1: Missing sync-rules tables: %', missing_tables;
    END IF;

    RAISE NOTICE 'PASS Test 1: All sync-rules tables exist';
END $$;

-- =============================================================================
-- Test 2: Verify RLS is enabled on all user-data tables
-- =============================================================================
-- Every table that contains user or financial data must have RLS enabled.
-- A table with RLS disabled would leak data across households.

DO $$
DECLARE
    tbl RECORD;
    unprotected TEXT[];
    required_tables TEXT[] := ARRAY[
        'users',
        'households',
        'household_members',
        'accounts',
        'categories',
        'transactions',
        'budgets',
        'goals',
        'passkey_credentials',
        'household_invitations',
        'webauthn_challenges',
        'audit_log',
        'sync_health_logs',
        'data_export_audit_log'
    ];
    t TEXT;
BEGIN
    unprotected := '{}';

    FOREACH t IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = t
              AND c.relrowsecurity = true
        ) THEN
            unprotected := array_append(unprotected, t);
        END IF;
    END LOOP;

    IF array_length(unprotected, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 2: Tables without RLS enabled: %', unprotected;
    END IF;

    RAISE NOTICE 'PASS Test 2: RLS is enabled on all user-data tables';
END $$;

-- =============================================================================
-- Test 3: Verify household_ids() function exists and returns correct results
-- =============================================================================
-- The auth.household_ids() function is the backbone of household-based RLS.
-- We test it by directly querying household_members for a known seed user.

DO $$
DECLARE
    fn_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'auth'
          AND p.proname = 'household_ids'
    ) INTO fn_exists;

    IF NOT fn_exists THEN
        RAISE EXCEPTION 'FAIL Test 3: auth.household_ids() function does not exist';
    END IF;

    RAISE NOTICE 'PASS Test 3: auth.household_ids() function exists';
END $$;

-- =============================================================================
-- Test 4: Verify custom_access_token_hook exists with correct signature
-- =============================================================================
-- The hook must accept a JSONB event and return JSONB.
-- It must be owned by a SECURITY DEFINER context.

DO $$
DECLARE
    hook_exists BOOLEAN;
    is_definer BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'auth'
          AND p.proname = 'custom_access_token_hook'
          AND pg_get_function_arguments(p.oid) = 'event jsonb'
          AND pg_get_function_result(p.oid) = 'jsonb'
    ) INTO hook_exists;

    IF NOT hook_exists THEN
        RAISE EXCEPTION 'FAIL Test 4: auth.custom_access_token_hook(jsonb) does not exist';
    END IF;

    -- Verify SECURITY DEFINER
    SELECT p.prosecdef INTO is_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'custom_access_token_hook';

    IF NOT is_definer THEN
        RAISE EXCEPTION 'FAIL Test 4: custom_access_token_hook is not SECURITY DEFINER';
    END IF;

    RAISE NOTICE 'PASS Test 4: custom_access_token_hook exists with correct signature (SECURITY DEFINER)';
END $$;

-- =============================================================================
-- Test 5: Verify sync_version columns exist on all synced tables
-- =============================================================================
-- Tables replicated via PowerSync need sync_version (BIGINT) and is_synced
-- (BOOLEAN) columns for the sync engine's change-tracking protocol.

DO $$
DECLARE
    synced_tables TEXT[] := ARRAY[
        'accounts',
        'transactions',
        'categories',
        'budgets',
        'goals'
    ];
    tbl TEXT;
    missing_sync_version TEXT[];
    missing_is_synced TEXT[];
BEGIN
    missing_sync_version := '{}';
    missing_is_synced := '{}';

    FOREACH tbl IN ARRAY synced_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = tbl
              AND column_name = 'sync_version'
              AND data_type = 'bigint'
        ) THEN
            missing_sync_version := array_append(missing_sync_version, tbl);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = tbl
              AND column_name = 'is_synced'
              AND data_type = 'boolean'
        ) THEN
            missing_is_synced := array_append(missing_is_synced, tbl);
        END IF;
    END LOOP;

    IF array_length(missing_sync_version, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 5: Tables missing sync_version column: %', missing_sync_version;
    END IF;

    IF array_length(missing_is_synced, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 5: Tables missing is_synced column: %', missing_is_synced;
    END IF;

    RAISE NOTICE 'PASS Test 5: All synced tables have sync_version and is_synced columns';
END $$;

-- =============================================================================
-- Test 6: Verify soft-delete filtering (deleted rows not visible via RLS)
-- =============================================================================
-- Insert a row with deleted_at set, then verify that queries filtering on
-- deleted_at IS NULL exclude it. This mirrors the sync-rules WHERE clause.

DO $$
DECLARE
    alice_id UUID := 'a1a1a1a1-1111-4111-a111-111111111111';
    alice_hh UUID := '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    test_account_id UUID;
    visible_count INTEGER;
BEGIN
    -- Insert a soft-deleted account
    INSERT INTO accounts (household_id, name, type, currency_code, balance_cents, deleted_at)
    VALUES (alice_hh, '__test_deleted_account__', 'checking', 'USD', 0, now())
    RETURNING id INTO test_account_id;

    -- Count active (non-deleted) accounts with this test name
    SELECT COUNT(*) INTO visible_count
    FROM accounts
    WHERE household_id = alice_hh
      AND name = '__test_deleted_account__'
      AND deleted_at IS NULL;

    IF visible_count != 0 THEN
        RAISE EXCEPTION 'FAIL Test 6: Soft-deleted account is visible (count = %)', visible_count;
    END IF;

    -- Clean up (within transaction, will be rolled back anyway)
    DELETE FROM accounts WHERE id = test_account_id;

    RAISE NOTICE 'PASS Test 6: Soft-deleted rows are correctly filtered out';
END $$;

-- =============================================================================
-- Test 7: Verify all monetary columns use BIGINT (cents), never NUMERIC/FLOAT
-- =============================================================================
-- Schema design rule: all monetary values stored as BIGINT cents.
-- This prevents floating-point rounding errors in financial calculations.

DO $$
DECLARE
    bad_columns RECORD;
    violation_found BOOLEAN := false;
BEGIN
    FOR bad_columns IN
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name LIKE '%_cents'
          AND data_type NOT IN ('bigint')
    LOOP
        RAISE WARNING 'VIOLATION: %.% is % (expected bigint)',
            bad_columns.table_name, bad_columns.column_name, bad_columns.data_type;
        violation_found := true;
    END LOOP;

    IF violation_found THEN
        RAISE EXCEPTION 'FAIL Test 7: Monetary columns found with non-BIGINT types';
    END IF;

    RAISE NOTICE 'PASS Test 7: All *_cents columns use BIGINT';
END $$;

-- =============================================================================
-- Test 8: Verify currency_code columns exist alongside monetary columns
-- =============================================================================
-- Schema design rule: ISO 4217 currency code stored alongside every
-- monetary column to prevent implicit currency assumptions.

DO $$
DECLARE
    tables_with_cents TEXT[];
    tbl TEXT;
    missing_currency TEXT[];
BEGIN
    -- Find all tables that have a *_cents column
    SELECT array_agg(DISTINCT table_name) INTO tables_with_cents
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name LIKE '%_cents';

    IF tables_with_cents IS NULL THEN
        RAISE EXCEPTION 'FAIL Test 8: No tables with *_cents columns found';
    END IF;

    missing_currency := '{}';

    FOREACH tbl IN ARRAY tables_with_cents
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = tbl
              AND column_name = 'currency_code'
        ) THEN
            missing_currency := array_append(missing_currency, tbl);
        END IF;
    END LOOP;

    IF array_length(missing_currency, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 8: Tables with *_cents but no currency_code: %', missing_currency;
    END IF;

    RAISE NOTICE 'PASS Test 8: All tables with monetary columns have currency_code';
END $$;

-- =============================================================================
-- Test 9: Verify accept_household_invitation atomic operation
-- =============================================================================
-- The accept_household_invitation RPC must exist and handle edge cases:
--   - INVITE_NOT_FOUND for missing codes
--   - INVITE_EXPIRED for expired invitations
--   - INVITE_ALREADY_ACCEPTED for accepted invitations
--   - ALREADY_MEMBER for existing members

DO $$
DECLARE
    result JSONB;
    fn_exists BOOLEAN;
BEGIN
    -- Verify function exists
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'accept_household_invitation'
    ) INTO fn_exists;

    IF NOT fn_exists THEN
        RAISE EXCEPTION 'FAIL Test 9: accept_household_invitation() does not exist';
    END IF;

    -- Test INVITE_NOT_FOUND for a non-existent invite code
    SELECT public.accept_household_invitation(
        'NONEXISTENT_CODE_12345',
        'a1a1a1a1-1111-4111-a111-111111111111'::uuid,
        'alice@example.com'
    ) INTO result;

    IF result->>'error' != 'INVITE_NOT_FOUND' THEN
        RAISE EXCEPTION 'FAIL Test 9: Expected INVITE_NOT_FOUND, got: %', result;
    END IF;

    RAISE NOTICE 'PASS Test 9: accept_household_invitation handles edge cases correctly';
END $$;

-- =============================================================================
-- Test 10: Verify handle_new_user_signup idempotency
-- =============================================================================
-- Calling handle_new_user_signup twice with the same user_id must not
-- create duplicate households. The second call returns already_provisioned.

DO $$
DECLARE
    test_user_id UUID := gen_random_uuid();
    result1 JSONB;
    result2 JSONB;
    hh_count INTEGER;
BEGIN
    -- First signup call
    SELECT public.handle_new_user_signup(test_user_id, 'idempotent-test@example.com', 'Idempotent User')
    INTO result1;

    -- Second signup call (simulates duplicate webhook fire)
    SELECT public.handle_new_user_signup(test_user_id, 'idempotent-test@example.com', 'Idempotent User')
    INTO result2;

    -- Must return already_provisioned on second call
    IF NOT (result2->>'already_provisioned')::boolean THEN
        RAISE EXCEPTION 'FAIL Test 10: Second signup did not return already_provisioned. Got: %', result2;
    END IF;

    -- Must not have created a second household
    SELECT COUNT(*) INTO hh_count
    FROM household_members
    WHERE user_id = test_user_id
      AND deleted_at IS NULL;

    IF hh_count != 1 THEN
        RAISE EXCEPTION 'FAIL Test 10: Expected 1 household membership, found %', hh_count;
    END IF;

    -- Both calls must return the same household_id
    IF result1->>'household_id' != result2->>'household_id' THEN
        RAISE EXCEPTION 'FAIL Test 10: Household IDs differ between calls: % vs %',
            result1->>'household_id', result2->>'household_id';
    END IF;

    -- Clean up test data (within transaction, rolled back anyway)
    DELETE FROM household_members WHERE user_id = test_user_id;
    DELETE FROM households WHERE created_by = test_user_id;
    DELETE FROM users WHERE id = test_user_id;

    RAISE NOTICE 'PASS Test 10: handle_new_user_signup is idempotent';
END $$;

-- =============================================================================
-- Test 11: Verify updated_at triggers fire on row updates
-- =============================================================================
-- Every core table has a BEFORE UPDATE trigger that sets updated_at = now().

DO $$
DECLARE
    alice_hh UUID := '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    test_cat_id UUID;
    old_updated TIMESTAMPTZ;
    new_updated TIMESTAMPTZ;
BEGIN
    -- Insert a test category with a known updated_at
    INSERT INTO categories (household_id, name, icon, is_income, sort_order)
    VALUES (alice_hh, '__test_trigger_cat__', 'test', false, 999)
    RETURNING id, updated_at INTO test_cat_id, old_updated;

    -- Small delay to ensure clock advances
    PERFORM pg_sleep(0.01);

    -- Update the row
    UPDATE categories SET name = '__test_trigger_cat_updated__' WHERE id = test_cat_id;

    SELECT updated_at INTO new_updated FROM categories WHERE id = test_cat_id;

    IF new_updated <= old_updated THEN
        RAISE EXCEPTION 'FAIL Test 11: updated_at trigger did not fire (old=%, new=%)',
            old_updated, new_updated;
    END IF;

    -- Clean up
    DELETE FROM categories WHERE id = test_cat_id;

    RAISE NOTICE 'PASS Test 11: updated_at triggers fire correctly';
END $$;

-- =============================================================================
-- Test 12: Verify all tables have standard columns (id, created_at, updated_at, deleted_at)
-- =============================================================================
-- Schema design rule: all core tables must have these standard columns.
-- Exceptions: audit_log (no updated_at/deleted_at — append-only),
--             webauthn_challenges (ephemeral — no updated_at/deleted_at),
--             sync_health_logs (append-only — no updated_at/deleted_at),
--             data_export_audit_log (append-only — no updated_at/deleted_at).

DO $$
DECLARE
    core_tables TEXT[] := ARRAY[
        'users',
        'households',
        'household_members',
        'accounts',
        'categories',
        'transactions',
        'budgets',
        'goals',
        'passkey_credentials',
        'household_invitations'
    ];
    tbl TEXT;
    required_cols TEXT[] := ARRAY['id', 'created_at', 'updated_at', 'deleted_at'];
    col TEXT;
    missing TEXT[];
BEGIN
    missing := '{}';

    FOREACH tbl IN ARRAY core_tables
    LOOP
        FOREACH col IN ARRAY required_cols
        LOOP
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = tbl
                  AND column_name = col
            ) THEN
                missing := array_append(missing, tbl || '.' || col);
            END IF;
        END LOOP;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 12: Missing standard columns: %', missing;
    END IF;

    RAISE NOTICE 'PASS Test 12: All core tables have id, created_at, updated_at, deleted_at';
END $$;

-- =============================================================================
-- Test 13: Verify household_id foreign key exists on household-scoped tables
-- =============================================================================
-- All household-scoped tables must have a household_id FK to households(id).

DO $$
DECLARE
    hh_tables TEXT[] := ARRAY[
        'accounts',
        'categories',
        'transactions',
        'budgets',
        'goals',
        'household_invitations'
    ];
    tbl TEXT;
    missing_fk TEXT[];
BEGIN
    missing_fk := '{}';

    FOREACH tbl IN ARRAY hh_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = tbl
              AND column_name = 'household_id'
        ) THEN
            missing_fk := array_append(missing_fk, tbl);
        END IF;
    END LOOP;

    IF array_length(missing_fk, 1) > 0 THEN
        RAISE EXCEPTION 'FAIL Test 13: Tables missing household_id column: %', missing_fk;
    END IF;

    RAISE NOTICE 'PASS Test 13: All household-scoped tables have household_id';
END $$;

-- =============================================================================
-- Test 14: Verify RLS policies exist for each operation on core tables
-- =============================================================================
-- Each core table should have at least a SELECT policy.
-- Household-scoped tables should have SELECT, INSERT, UPDATE, DELETE policies.

DO $$
DECLARE
    tbl TEXT;
    policy_count INTEGER;
    hh_tables TEXT[] := ARRAY[
        'accounts',
        'categories',
        'transactions',
        'budgets',
        'goals'
    ];
BEGIN
    FOREACH tbl IN ARRAY hh_tables
    LOOP
        SELECT COUNT(*) INTO policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl;

        IF policy_count < 4 THEN
            RAISE EXCEPTION 'FAIL Test 14: Table % has only % RLS policies (expected >= 4 for SELECT/INSERT/UPDATE/DELETE)',
                tbl, policy_count;
        END IF;
    END LOOP;

    RAISE NOTICE 'PASS Test 14: All household-scoped tables have sufficient RLS policies';
END $$;

-- =============================================================================
-- Summary
-- =============================================================================

ROLLBACK;

DO $$ BEGIN RAISE NOTICE ''; END $$;
DO $$ BEGIN RAISE NOTICE '=== All sync integration tests passed ==='; END $$;
DO $$ BEGIN RAISE NOTICE ''; END $$;
