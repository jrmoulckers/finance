-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260330000005_enforce_owner_id_rls
-- Description: Enforce owner_id attribution on INSERT and UPDATE policies
-- Issues: #1316
--
-- Threat: Without owner_id checks on INSERT/UPDATE, any household member can
-- create records attributed to another member (spoofing) or reassign
-- attribution on existing records (tampering).
--
-- The standardize_owner_id migration (20260326000005) added owner_id columns
-- and SELECT policies, but left INSERT/UPDATE/DELETE policies unchanged.
-- Newer tables (investment_portfolios, import_jobs, bill_reminders, etc.)
-- already enforce owner_id = auth.uid() on INSERT. This migration closes the
-- gap on the original core tables and report tables.
--
-- Approach:
--   We DROP and re-CREATE the affected policies rather than using CREATE OR
--   REPLACE (which doesn't exist for policies). The replacement policies add:
--     INSERT: owner_id IS NULL OR owner_id = auth.uid()
--     UPDATE WITH CHECK: owner_id IS NULL OR owner_id = auth.uid()
--   owner_id IS NULL is allowed because the column is still nullable (backfill
--   in progress). Once the backfill migration sets NOT NULL, remove that branch.
--
-- Tables affected:
--   accounts, categories, transactions, budgets, goals,
--   recurring_transaction_templates, report_configs, scheduled_reports
--
-- DOWN migration: at the bottom.

-- =============================================================================
-- UP
-- =============================================================================

-- =============================================================================
-- accounts
-- =============================================================================

DROP POLICY IF EXISTS accounts_insert ON accounts;
CREATE POLICY accounts_insert ON accounts
    FOR INSERT
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

DROP POLICY IF EXISTS accounts_update ON accounts;
CREATE POLICY accounts_update ON accounts
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

-- =============================================================================
-- categories
-- =============================================================================

DROP POLICY IF EXISTS categories_insert ON categories;
CREATE POLICY categories_insert ON categories
    FOR INSERT
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

DROP POLICY IF EXISTS categories_update ON categories;
CREATE POLICY categories_update ON categories
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

-- =============================================================================
-- transactions
-- =============================================================================

DROP POLICY IF EXISTS transactions_insert ON transactions;
CREATE POLICY transactions_insert ON transactions
    FOR INSERT
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

DROP POLICY IF EXISTS transactions_update ON transactions;
CREATE POLICY transactions_update ON transactions
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

-- =============================================================================
-- budgets
-- =============================================================================

DROP POLICY IF EXISTS budgets_insert ON budgets;
CREATE POLICY budgets_insert ON budgets
    FOR INSERT
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

DROP POLICY IF EXISTS budgets_update ON budgets;
CREATE POLICY budgets_update ON budgets
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

-- =============================================================================
-- goals
-- =============================================================================

DROP POLICY IF EXISTS goals_insert ON goals;
CREATE POLICY goals_insert ON goals
    FOR INSERT
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

DROP POLICY IF EXISTS goals_update ON goals;
CREATE POLICY goals_update ON goals
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

-- =============================================================================
-- recurring_transaction_templates
-- =============================================================================

DROP POLICY IF EXISTS recurring_templates_insert ON recurring_transaction_templates;
CREATE POLICY recurring_templates_insert ON recurring_transaction_templates
    FOR INSERT
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

DROP POLICY IF EXISTS recurring_templates_update ON recurring_transaction_templates;
CREATE POLICY recurring_templates_update ON recurring_transaction_templates
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

-- =============================================================================
-- report_configs
-- =============================================================================

DROP POLICY IF EXISTS report_configs_insert ON report_configs;
CREATE POLICY report_configs_insert ON report_configs
    FOR INSERT
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

DROP POLICY IF EXISTS report_configs_update ON report_configs;
CREATE POLICY report_configs_update ON report_configs
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

-- =============================================================================
-- scheduled_reports
-- =============================================================================

DROP POLICY IF EXISTS scheduled_reports_insert ON scheduled_reports;
CREATE POLICY scheduled_reports_insert ON scheduled_reports
    FOR INSERT
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

DROP POLICY IF EXISTS scheduled_reports_update ON scheduled_reports;
CREATE POLICY scheduled_reports_update ON scheduled_reports
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (
        household_id = ANY(auth.household_ids())
        AND (owner_id IS NULL OR owner_id = auth.uid())
    );

-- =============================================================================
-- DOWN (to revert, run these statements IN ORDER)
-- =============================================================================
-- Restores the original policies without owner_id checks.
--
-- -- accounts
-- DROP POLICY IF EXISTS accounts_insert ON accounts;
-- CREATE POLICY accounts_insert ON accounts FOR INSERT WITH CHECK (household_id = ANY(auth.household_ids()));
-- DROP POLICY IF EXISTS accounts_update ON accounts;
-- CREATE POLICY accounts_update ON accounts FOR UPDATE USING (household_id = ANY(auth.household_ids())) WITH CHECK (household_id = ANY(auth.household_ids()));
--
-- -- categories
-- DROP POLICY IF EXISTS categories_insert ON categories;
-- CREATE POLICY categories_insert ON categories FOR INSERT WITH CHECK (household_id = ANY(auth.household_ids()));
-- DROP POLICY IF EXISTS categories_update ON categories;
-- CREATE POLICY categories_update ON categories FOR UPDATE USING (household_id = ANY(auth.household_ids())) WITH CHECK (household_id = ANY(auth.household_ids()));
--
-- -- transactions
-- DROP POLICY IF EXISTS transactions_insert ON transactions;
-- CREATE POLICY transactions_insert ON transactions FOR INSERT WITH CHECK (household_id = ANY(auth.household_ids()));
-- DROP POLICY IF EXISTS transactions_update ON transactions;
-- CREATE POLICY transactions_update ON transactions FOR UPDATE USING (household_id = ANY(auth.household_ids())) WITH CHECK (household_id = ANY(auth.household_ids()));
--
-- -- budgets
-- DROP POLICY IF EXISTS budgets_insert ON budgets;
-- CREATE POLICY budgets_insert ON budgets FOR INSERT WITH CHECK (household_id = ANY(auth.household_ids()));
-- DROP POLICY IF EXISTS budgets_update ON budgets;
-- CREATE POLICY budgets_update ON budgets FOR UPDATE USING (household_id = ANY(auth.household_ids())) WITH CHECK (household_id = ANY(auth.household_ids()));
--
-- -- goals
-- DROP POLICY IF EXISTS goals_insert ON goals;
-- CREATE POLICY goals_insert ON goals FOR INSERT WITH CHECK (household_id = ANY(auth.household_ids()));
-- DROP POLICY IF EXISTS goals_update ON goals;
-- CREATE POLICY goals_update ON goals FOR UPDATE USING (household_id = ANY(auth.household_ids())) WITH CHECK (household_id = ANY(auth.household_ids()));
--
-- -- recurring_transaction_templates
-- DROP POLICY IF EXISTS recurring_templates_insert ON recurring_transaction_templates;
-- CREATE POLICY recurring_templates_insert ON recurring_transaction_templates FOR INSERT WITH CHECK (household_id = ANY(auth.household_ids()));
-- DROP POLICY IF EXISTS recurring_templates_update ON recurring_transaction_templates;
-- CREATE POLICY recurring_templates_update ON recurring_transaction_templates FOR UPDATE USING (household_id = ANY(auth.household_ids())) WITH CHECK (household_id = ANY(auth.household_ids()));
--
-- -- report_configs
-- DROP POLICY IF EXISTS report_configs_insert ON report_configs;
-- CREATE POLICY report_configs_insert ON report_configs FOR INSERT WITH CHECK (household_id = ANY(auth.household_ids()));
-- DROP POLICY IF EXISTS report_configs_update ON report_configs;
-- CREATE POLICY report_configs_update ON report_configs FOR UPDATE USING (household_id = ANY(auth.household_ids())) WITH CHECK (household_id = ANY(auth.household_ids()));
--
-- -- scheduled_reports
-- DROP POLICY IF EXISTS scheduled_reports_insert ON scheduled_reports;
-- CREATE POLICY scheduled_reports_insert ON scheduled_reports FOR INSERT WITH CHECK (household_id = ANY(auth.household_ids()));
-- DROP POLICY IF EXISTS scheduled_reports_update ON scheduled_reports;
-- CREATE POLICY scheduled_reports_update ON scheduled_reports FOR UPDATE USING (household_id = ANY(auth.household_ids())) WITH CHECK (household_id = ANY(auth.household_ids()));
