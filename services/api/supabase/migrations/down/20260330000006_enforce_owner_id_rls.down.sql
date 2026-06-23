-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260330000006_enforce_owner_id_rls
-- Description: Revert owner_id enforcement on INSERT/UPDATE RLS policies
-- Issues: #1316, #2881
--
-- NOTE: review before applying
--
-- =============================================================================
-- What this reversal does
-- =============================================================================
-- Reversal of services/api/supabase/migrations/20260330000005_enforce_owner_id_rls.sql.
--
-- The up migration tightened the INSERT and UPDATE policies on eight tables so
-- that a row's owner_id must be NULL or equal to auth.uid(). This DROPs those
-- hardened policies and re-CREATEs the ORIGINAL policies (household-scope only,
-- no owner_id attribution check), restoring the exact state that existed before
-- the up migration was applied.
--
-- SECURITY WARNING: applying this down migration RELAXES access control. After
-- reversal, any household member can create or update rows attributed to a
-- different member (the spoofing/tampering gap the up migration closed). Only
-- run this as a deliberate rollback of #1316 and re-audit attribution afterward.
--
-- The up migration did NOT add owner_id columns, change nullability, or touch
-- SELECT/DELETE policies — those were established by 20260326000005 and the
-- original table migrations — so this reversal only restores the INSERT/UPDATE
-- policy bodies and leaves all columns and other policies untouched.
--
-- Original policy sources restored here:
--   accounts, categories, transactions, budgets, goals -> 20260306000002
--   recurring_transaction_templates                    -> 20260323000002
--   report_configs, scheduled_reports                  -> 20260328000005
--
-- Apply IN ORDER. Each policy is dropped (IF EXISTS) before being recreated.

-- =============================================================================
-- accounts
-- =============================================================================
DROP POLICY IF EXISTS accounts_insert ON accounts;
CREATE POLICY accounts_insert ON accounts
    FOR INSERT
    WITH CHECK (household_id = ANY(public.household_ids()));

DROP POLICY IF EXISTS accounts_update ON accounts;
CREATE POLICY accounts_update ON accounts
    FOR UPDATE
    USING (household_id = ANY(public.household_ids()))
    WITH CHECK (household_id = ANY(public.household_ids()));

-- =============================================================================
-- categories
-- =============================================================================
DROP POLICY IF EXISTS categories_insert ON categories;
CREATE POLICY categories_insert ON categories
    FOR INSERT
    WITH CHECK (household_id = ANY(public.household_ids()));

DROP POLICY IF EXISTS categories_update ON categories;
CREATE POLICY categories_update ON categories
    FOR UPDATE
    USING (household_id = ANY(public.household_ids()))
    WITH CHECK (household_id = ANY(public.household_ids()));

-- =============================================================================
-- transactions
-- =============================================================================
DROP POLICY IF EXISTS transactions_insert ON transactions;
CREATE POLICY transactions_insert ON transactions
    FOR INSERT
    WITH CHECK (household_id = ANY(public.household_ids()));

DROP POLICY IF EXISTS transactions_update ON transactions;
CREATE POLICY transactions_update ON transactions
    FOR UPDATE
    USING (household_id = ANY(public.household_ids()))
    WITH CHECK (household_id = ANY(public.household_ids()));

-- =============================================================================
-- budgets
-- =============================================================================
DROP POLICY IF EXISTS budgets_insert ON budgets;
CREATE POLICY budgets_insert ON budgets
    FOR INSERT
    WITH CHECK (household_id = ANY(public.household_ids()));

DROP POLICY IF EXISTS budgets_update ON budgets;
CREATE POLICY budgets_update ON budgets
    FOR UPDATE
    USING (household_id = ANY(public.household_ids()))
    WITH CHECK (household_id = ANY(public.household_ids()));

-- =============================================================================
-- goals
-- =============================================================================
DROP POLICY IF EXISTS goals_insert ON goals;
CREATE POLICY goals_insert ON goals
    FOR INSERT
    WITH CHECK (household_id = ANY(public.household_ids()));

DROP POLICY IF EXISTS goals_update ON goals;
CREATE POLICY goals_update ON goals
    FOR UPDATE
    USING (household_id = ANY(public.household_ids()))
    WITH CHECK (household_id = ANY(public.household_ids()));

-- =============================================================================
-- recurring_transaction_templates
-- =============================================================================
DROP POLICY IF EXISTS recurring_templates_insert ON recurring_transaction_templates;
CREATE POLICY recurring_templates_insert ON recurring_transaction_templates
    FOR INSERT
    WITH CHECK (household_id = ANY(public.household_ids()));

DROP POLICY IF EXISTS recurring_templates_update ON recurring_transaction_templates;
CREATE POLICY recurring_templates_update ON recurring_transaction_templates
    FOR UPDATE
    USING (household_id = ANY(public.household_ids()))
    WITH CHECK (household_id = ANY(public.household_ids()));

-- =============================================================================
-- report_configs
-- =============================================================================
DROP POLICY IF EXISTS report_configs_insert ON report_configs;
CREATE POLICY report_configs_insert ON report_configs
    FOR INSERT
    WITH CHECK (household_id = ANY(public.household_ids()));

DROP POLICY IF EXISTS report_configs_update ON report_configs;
CREATE POLICY report_configs_update ON report_configs
    FOR UPDATE
    USING (household_id = ANY(public.household_ids()))
    WITH CHECK (household_id = ANY(public.household_ids()));

-- =============================================================================
-- scheduled_reports
-- =============================================================================
DROP POLICY IF EXISTS scheduled_reports_insert ON scheduled_reports;
CREATE POLICY scheduled_reports_insert ON scheduled_reports
    FOR INSERT
    WITH CHECK (household_id = ANY(public.household_ids()));

DROP POLICY IF EXISTS scheduled_reports_update ON scheduled_reports;
CREATE POLICY scheduled_reports_update ON scheduled_reports
    FOR UPDATE
    USING (household_id = ANY(public.household_ids()))
    WITH CHECK (household_id = ANY(public.household_ids()));
