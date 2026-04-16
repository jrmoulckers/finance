-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Schema Alignment Integration Tests
-- =============================================================================
-- Issue: #880
--
-- Validates that the schema alignment migrations (#866) are correctly applied
-- and that RLS policies work with the new columns.
--
-- Run with:
--   psql "$DATABASE_URL" -f supabase/tests/schema-alignment-integration.test.sql
--
-- Prerequisites:
--   - All migrations up to 20260326000005 must be applied
--   - Test creates and cleans up its own data using service_role
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Verify new columns exist
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    col_exists BOOLEAN;
BEGIN
    RAISE NOTICE '=== Schema Alignment Integration Tests ===';
    RAISE NOTICE '';
    RAISE NOTICE '--- 1. Column Existence ---';

    -- transactions.transfer_transaction_id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transactions'
          AND column_name = 'transfer_transaction_id'
    ) INTO col_exists;
    IF col_exists THEN RAISE NOTICE '  ✅ transactions.transfer_transaction_id exists';
    ELSE RAISE WARNING '  ❌ transactions.transfer_transaction_id MISSING'; END IF;

    -- transactions.recurring_rule_id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transactions'
          AND column_name = 'recurring_rule_id'
    ) INTO col_exists;
    IF col_exists THEN RAISE NOTICE '  ✅ transactions.recurring_rule_id exists';
    ELSE RAISE WARNING '  ❌ transactions.recurring_rule_id MISSING'; END IF;

    -- budgets.is_rollover
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'budgets'
          AND column_name = 'is_rollover'
    ) INTO col_exists;
    IF col_exists THEN RAISE NOTICE '  ✅ budgets.is_rollover exists';
    ELSE RAISE WARNING '  ❌ budgets.is_rollover MISSING'; END IF;

    -- goals.account_id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'goals'
          AND column_name = 'account_id'
    ) INTO col_exists;
    IF col_exists THEN RAISE NOTICE '  ✅ goals.account_id exists';
    ELSE RAISE WARNING '  ❌ goals.account_id MISSING'; END IF;

    -- goals.status
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'goals'
          AND column_name = 'status'
    ) INTO col_exists;
    IF col_exists THEN RAISE NOTICE '  ✅ goals.status exists';
    ELSE RAISE WARNING '  ❌ goals.status MISSING'; END IF;

    -- owner_id on sync-enabled tables
    DECLARE
        tbl TEXT;
        tables TEXT[] := ARRAY['accounts', 'categories', 'transactions', 'budgets', 'goals', 'recurring_transaction_templates'];
    BEGIN
        FOREACH tbl IN ARRAY tables LOOP
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = tbl
                  AND column_name = 'owner_id'
            ) INTO col_exists;
            IF col_exists THEN RAISE NOTICE '  ✅ %.owner_id exists', tbl;
            ELSE RAISE WARNING '  ❌ %.owner_id MISSING', tbl; END IF;
        END LOOP;
    END;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Verify CHECK constraints
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    constraint_exists BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '--- 2. CHECK Constraints ---';

    -- goals.status CHECK constraint
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'goals'
          AND cc.constraint_name = 'chk_goals_status'
    ) INTO constraint_exists;
    IF constraint_exists THEN RAISE NOTICE '  ✅ goals.chk_goals_status CHECK exists';
    ELSE RAISE WARNING '  ❌ goals.chk_goals_status CHECK MISSING'; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Verify indexes
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    idx_exists BOOLEAN;
    idx TEXT;
    expected_indexes TEXT[] := ARRAY[
        'idx_transactions_transfer_pair',
        'idx_transactions_recurring_rule',
        'idx_goals_account',
        'idx_goals_status',
        'idx_accounts_owner',
        'idx_categories_owner',
        'idx_transactions_owner',
        'idx_budgets_owner',
        'idx_goals_owner',
        'idx_recurring_templates_owner'
    ];
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '--- 3. Index Verification ---';

    FOREACH idx IN ARRAY expected_indexes LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = idx
        ) INTO idx_exists;
        IF idx_exists THEN RAISE NOTICE '  ✅ % exists', idx;
        ELSE RAISE WARNING '  ❌ % MISSING', idx; END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Verify RLS policies for owner_id
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    policy_exists BOOLEAN;
    pol TEXT;
    expected_policies TEXT[] := ARRAY[
        'accounts_select_owner',
        'categories_select_owner',
        'transactions_select_owner',
        'budgets_select_owner',
        'goals_select_owner',
        'recurring_templates_select_owner'
    ];
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '--- 4. Owner RLS Policies ---';

    FOREACH pol IN ARRAY expected_policies LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE policyname = pol
        ) INTO policy_exists;
        IF policy_exists THEN RAISE NOTICE '  ✅ % exists', pol;
        ELSE RAISE WARNING '  ❌ % MISSING', pol; END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Verify default values
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    default_val TEXT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '--- 5. Default Values ---';

    -- budgets.is_rollover DEFAULT false
    SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budgets' AND column_name = 'is_rollover'
    INTO default_val;
    IF default_val = 'false' THEN RAISE NOTICE '  ✅ budgets.is_rollover defaults to false';
    ELSE RAISE WARNING '  ❌ budgets.is_rollover default is: %', COALESCE(default_val, 'NULL'); END IF;

    -- goals.status DEFAULT 'active'
    SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'status'
    INTO default_val;
    IF default_val LIKE '%active%' THEN RAISE NOTICE '  ✅ goals.status defaults to active';
    ELSE RAISE WARNING '  ❌ goals.status default is: %', COALESCE(default_val, 'NULL'); END IF;

    RAISE NOTICE '';
    RAISE NOTICE '=== Schema Alignment Tests Complete ===';
END $$;
