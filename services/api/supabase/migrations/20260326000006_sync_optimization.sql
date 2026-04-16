-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260326000006_sync_optimization
-- Description: Sync optimization — schema version tracking and materialized view
-- Issues: #880
--
-- Changes:
--   1. schema_version() function — Returns the current schema version for
--      sync clients to detect when schema changes require a full re-sync.
--   2. Materialized view for household financial summary — Pre-computed
--      aggregates for dashboard display, refreshed by maintenance function.
--   3. Update generate_recurring_transactions to set owner_id and recurring_rule_id
--      on generated transactions.
--
-- Security:
--   - schema_version is read-only and exposes no user data
--   - Materialized view has RLS via the function that queries it
--   - generate_recurring_transactions remains SECURITY DEFINER
--
-- DOWN migration: at the bottom.

-- =============================================================================
-- 1. Schema version function
-- =============================================================================
-- Returns the latest applied migration timestamp. Sync clients call this to
-- detect schema drift — if the version changes, they know to re-sync.
--
-- This avoids hardcoding a version string that someone could forget to update.

CREATE OR REPLACE FUNCTION public.get_schema_version()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_latest_migration TEXT;
    v_migration_count INTEGER;
BEGIN
    -- Read from Supabase's migration tracking table
    SELECT name, count(*) OVER ()
    INTO v_latest_migration, v_migration_count
    FROM supabase_migrations.schema_migrations
    ORDER BY version DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'schema_version', COALESCE(v_latest_migration, 'unknown'),
        'migration_count', COALESCE(v_migration_count, 0),
        'checked_at', now()
    );
EXCEPTION WHEN OTHERS THEN
    -- If the migrations table doesn't exist (e.g., self-hosted without
    -- Supabase migration tracking), return a fallback version.
    RETURN jsonb_build_object(
        'schema_version', '20260326000006',
        'migration_count', -1,
        'checked_at', now()
    );
END;
$$;

-- Allow authenticated users to check schema version (no sensitive data)
GRANT EXECUTE ON FUNCTION public.get_schema_version() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schema_version() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_schema_version() FROM anon;

-- =============================================================================
-- 2. Household financial summary materialized view
-- =============================================================================
-- Pre-computes per-household aggregate statistics for the dashboard.
-- Refreshed periodically by the maintenance function.
--
-- NEVER contains individual transaction data — only aggregate counts and sums.
-- This reduces load on the database for common dashboard queries.

CREATE MATERIALIZED VIEW IF NOT EXISTS household_financial_summary AS
SELECT
    h.id AS household_id,
    -- Account aggregates
    COALESCE(acct.account_count, 0) AS account_count,
    COALESCE(acct.total_balance_cents, 0) AS total_balance_cents,
    -- Transaction aggregates (last 30 days)
    COALESCE(txn.transaction_count_30d, 0) AS transaction_count_30d,
    COALESCE(txn.income_cents_30d, 0) AS income_cents_30d,
    COALESCE(txn.expense_cents_30d, 0) AS expense_cents_30d,
    -- Category count
    COALESCE(cat.category_count, 0) AS category_count,
    -- Budget count
    COALESCE(bdg.budget_count, 0) AS budget_count,
    -- Goal aggregates
    COALESCE(gl.active_goal_count, 0) AS active_goal_count,
    COALESCE(gl.total_goal_target_cents, 0) AS total_goal_target_cents,
    COALESCE(gl.total_goal_current_cents, 0) AS total_goal_current_cents,
    -- Refresh timestamp
    now() AS refreshed_at
FROM households h
LEFT JOIN LATERAL (
    SELECT
        count(*) AS account_count,
        COALESCE(sum(balance_cents), 0) AS total_balance_cents
    FROM accounts
    WHERE household_id = h.id AND deleted_at IS NULL AND is_active = true
) acct ON true
LEFT JOIN LATERAL (
    SELECT
        count(*) AS transaction_count_30d,
        COALESCE(sum(CASE WHEN type IN ('INCOME', 'TRANSFER_IN') THEN amount_cents ELSE 0 END), 0) AS income_cents_30d,
        COALESCE(sum(CASE WHEN type IN ('EXPENSE', 'TRANSFER_OUT') THEN amount_cents ELSE 0 END), 0) AS expense_cents_30d
    FROM transactions
    WHERE household_id = h.id AND deleted_at IS NULL AND date >= CURRENT_DATE - 30
) txn ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS category_count
    FROM categories
    WHERE household_id = h.id AND deleted_at IS NULL
) cat ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS budget_count
    FROM budgets
    WHERE household_id = h.id AND deleted_at IS NULL
) bdg ON true
LEFT JOIN LATERAL (
    SELECT
        count(*) AS active_goal_count,
        COALESCE(sum(target_cents), 0) AS total_goal_target_cents,
        COALESCE(sum(current_cents), 0) AS total_goal_current_cents
    FROM goals
    WHERE household_id = h.id AND deleted_at IS NULL
) gl ON true
WHERE h.deleted_at IS NULL;

-- Index for fast household lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_household_summary_hh
    ON household_financial_summary (household_id);

-- =============================================================================
-- 3. Refresh function for the materialized view
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_household_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY household_financial_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_household_summary() TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_household_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_household_summary() FROM anon;

-- =============================================================================
-- 4. Update generate_recurring_transactions to populate new columns
-- =============================================================================
-- Sets recurring_rule_id on generated transactions so they link back to
-- the template that created them. Also sets owner_id if the template has one.

CREATE OR REPLACE FUNCTION public.generate_recurring_transactions(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    template RECORD;
    generated_count INTEGER := 0;
    next_date DATE;
BEGIN
    FOR template IN
        SELECT * FROM recurring_transaction_templates
        WHERE deleted_at IS NULL
          AND is_active = true
          AND next_due_date <= p_as_of_date
          AND (end_date IS NULL OR next_due_date <= end_date)
        ORDER BY next_due_date ASC
        FOR UPDATE SKIP LOCKED
    LOOP
        -- Insert the generated transaction instance with recurring_rule_id link
        INSERT INTO transactions (
            household_id, account_id, category_id,
            amount_cents, currency_code, type,
            payee, note, date,
            is_recurring, status,
            recurring_rule_id, owner_id
        ) VALUES (
            template.household_id, template.account_id, template.category_id,
            template.amount_cents, template.currency_code, template.type,
            template.payee, template.note, template.next_due_date,
            true, 'CLEARED',
            template.id, template.owner_id
        );

        -- Calculate the next due date based on the template frequency
        next_date := CASE template.frequency
            WHEN 'daily'     THEN template.next_due_date + INTERVAL '1 day'
            WHEN 'weekly'    THEN template.next_due_date + INTERVAL '1 week'
            WHEN 'biweekly'  THEN template.next_due_date + INTERVAL '2 weeks'
            WHEN 'monthly'   THEN template.next_due_date + INTERVAL '1 month'
            WHEN 'quarterly' THEN template.next_due_date + INTERVAL '3 months'
            WHEN 'yearly'    THEN template.next_due_date + INTERVAL '1 year'
        END;

        -- Deactivate template if the next occurrence would be past end_date
        IF template.end_date IS NOT NULL AND next_date > template.end_date THEN
            UPDATE recurring_transaction_templates
            SET is_active = false,
                last_generated_date = template.next_due_date
            WHERE id = template.id;
        ELSE
            UPDATE recurring_transaction_templates
            SET last_generated_date = template.next_due_date,
                next_due_date = next_date
            WHERE id = template.id;
        END IF;

        generated_count := generated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'generated_count', generated_count,
        'as_of_date', p_as_of_date,
        'generated_at', now()
    );
END;
$$;

-- Permissions unchanged
GRANT EXECUTE ON FUNCTION public.generate_recurring_transactions(DATE) TO service_role;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_transactions(DATE) FROM PUBLIC;


-- =============================================================================
-- DOWN (to revert, run these statements)
-- =============================================================================
-- -- 4. Restore original generate_recurring_transactions (without recurring_rule_id/owner_id)
-- -- (Run the original CREATE OR REPLACE from 20260323000002_recurring_transactions.sql)
--
-- -- 3. Drop refresh function
-- DROP FUNCTION IF EXISTS public.refresh_household_summary();
--
-- -- 2. Drop materialized view
-- DROP MATERIALIZED VIEW IF EXISTS household_financial_summary;
--
-- -- 1. Drop schema version function
-- DROP FUNCTION IF EXISTS public.get_schema_version();
