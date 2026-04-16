-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260326000005_standardize_owner_id
-- Description: Add owner_id to all sync-enabled tables
-- Issues: #866
--
-- Schema Design Rule: "All sync-enabled tables carry owner_id UUID REFERENCES
-- auth.users(id) for direct per-user queries in addition to household-level RLS."
--
-- Changes:
--   1. Add owner_id UUID column to: accounts, categories, transactions,
--      budgets, goals, recurring_transaction_templates
--   2. Add indexes on owner_id for each table
--   3. Add RLS policies that allow owner-based SELECT as an alternative path
--
-- owner_id represents the user who CREATED the record. It is used for:
--   - Direct per-user queries (e.g. "show me all transactions I created")
--   - PowerSync user-scoped filtering optimization
--   - Audit trail attribution
--
-- Note: owner_id is nullable initially to support backfilling existing data.
-- A future migration should set NOT NULL after backfill is complete.
--
-- Security: RLS policies are ADDITIVE. The new owner-based SELECT policies
-- provide an additional access path but do NOT weaken household isolation.
-- INSERT/UPDATE/DELETE still require household membership.
--
-- DOWN migration: at the bottom.

-- =============================================================================
-- UP
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add owner_id columns
-- ---------------------------------------------------------------------------

ALTER TABLE accounts
    ADD COLUMN owner_id UUID REFERENCES auth.users(id);

ALTER TABLE categories
    ADD COLUMN owner_id UUID REFERENCES auth.users(id);

ALTER TABLE transactions
    ADD COLUMN owner_id UUID REFERENCES auth.users(id);

ALTER TABLE budgets
    ADD COLUMN owner_id UUID REFERENCES auth.users(id);

ALTER TABLE goals
    ADD COLUMN owner_id UUID REFERENCES auth.users(id);

ALTER TABLE recurring_transaction_templates
    ADD COLUMN owner_id UUID REFERENCES auth.users(id);

-- ---------------------------------------------------------------------------
-- 2. Add indexes for owner-based lookups
-- ---------------------------------------------------------------------------

CREATE INDEX idx_accounts_owner
    ON accounts (owner_id)
    WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_categories_owner
    ON categories (owner_id)
    WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_transactions_owner
    ON transactions (owner_id)
    WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_budgets_owner
    ON budgets (owner_id)
    WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_goals_owner
    ON goals (owner_id)
    WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_recurring_templates_owner
    ON recurring_transaction_templates (owner_id)
    WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Owner-based SELECT policies (additive — does not replace household policies)
-- ---------------------------------------------------------------------------
-- These allow a user to SELECT rows they own, even if the household_ids()
-- lookup hasn't been evaluated yet (e.g. during PowerSync initial sync).
-- They do NOT grant INSERT/UPDATE/DELETE — those still require household membership.

CREATE POLICY accounts_select_owner ON accounts
    FOR SELECT
    USING (owner_id = auth.uid());

CREATE POLICY categories_select_owner ON categories
    FOR SELECT
    USING (owner_id = auth.uid());

CREATE POLICY transactions_select_owner ON transactions
    FOR SELECT
    USING (owner_id = auth.uid());

CREATE POLICY budgets_select_owner ON budgets
    FOR SELECT
    USING (owner_id = auth.uid());

CREATE POLICY goals_select_owner ON goals
    FOR SELECT
    USING (owner_id = auth.uid());

CREATE POLICY recurring_templates_select_owner ON recurring_transaction_templates
    FOR SELECT
    USING (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN accounts.owner_id IS
    'UUID of the user who created this account. Used for per-user queries and audit attribution.';
COMMENT ON COLUMN categories.owner_id IS
    'UUID of the user who created this category. Used for per-user queries and audit attribution.';
COMMENT ON COLUMN transactions.owner_id IS
    'UUID of the user who created this transaction. Used for per-user queries and audit attribution.';
COMMENT ON COLUMN budgets.owner_id IS
    'UUID of the user who created this budget. Used for per-user queries and audit attribution.';
COMMENT ON COLUMN goals.owner_id IS
    'UUID of the user who created this goal. Used for per-user queries and audit attribution.';
COMMENT ON COLUMN recurring_transaction_templates.owner_id IS
    'UUID of the user who created this template. Used for per-user queries and audit attribution.';


-- =============================================================================
-- DOWN (to revert, run these statements IN ORDER)
-- =============================================================================
-- -- 3. Drop owner-based SELECT policies
-- DROP POLICY IF EXISTS recurring_templates_select_owner ON recurring_transaction_templates;
-- DROP POLICY IF EXISTS goals_select_owner ON goals;
-- DROP POLICY IF EXISTS budgets_select_owner ON budgets;
-- DROP POLICY IF EXISTS transactions_select_owner ON transactions;
-- DROP POLICY IF EXISTS categories_select_owner ON categories;
-- DROP POLICY IF EXISTS accounts_select_owner ON accounts;
--
-- -- 2. Drop indexes
-- DROP INDEX IF EXISTS idx_recurring_templates_owner;
-- DROP INDEX IF EXISTS idx_goals_owner;
-- DROP INDEX IF EXISTS idx_budgets_owner;
-- DROP INDEX IF EXISTS idx_transactions_owner;
-- DROP INDEX IF EXISTS idx_categories_owner;
-- DROP INDEX IF EXISTS idx_accounts_owner;
--
-- -- 1. Drop columns
-- ALTER TABLE recurring_transaction_templates DROP COLUMN IF EXISTS owner_id;
-- ALTER TABLE goals DROP COLUMN IF EXISTS owner_id;
-- ALTER TABLE budgets DROP COLUMN IF EXISTS owner_id;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS owner_id;
-- ALTER TABLE categories DROP COLUMN IF EXISTS owner_id;
-- ALTER TABLE accounts DROP COLUMN IF EXISTS owner_id;
