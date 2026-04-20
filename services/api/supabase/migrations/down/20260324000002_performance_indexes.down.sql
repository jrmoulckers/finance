-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260324000002_performance_indexes
-- Description: Drop new composite/partial indexes and restore original single-column indexes
-- Issues: #893
--
-- This is the inverse of the performance indexes migration. It drops all
-- the optimized composite indexes and restores the original single-column
-- indexes from the initial schema.

-- =============================================================================
-- Phase 1: Drop new composite/partial indexes
-- =============================================================================
DROP INDEX IF EXISTS idx_transactions_account_date;
DROP INDEX IF EXISTS idx_transactions_household_date;
DROP INDEX IF EXISTS idx_transactions_category;
DROP INDEX IF EXISTS idx_transactions_type_date;
DROP INDEX IF EXISTS idx_transactions_sync;
DROP INDEX IF EXISTS idx_transactions_recurring;
DROP INDEX IF EXISTS idx_accounts_household;
DROP INDEX IF EXISTS idx_accounts_type;
DROP INDEX IF EXISTS idx_accounts_sync;
DROP INDEX IF EXISTS idx_budgets_household_period;
DROP INDEX IF EXISTS idx_budgets_category;
DROP INDEX IF EXISTS idx_goals_household;
DROP INDEX IF EXISTS idx_categories_household;
DROP INDEX IF EXISTS idx_household_members_user;
DROP INDEX IF EXISTS idx_household_members_household;
DROP INDEX IF EXISTS idx_audit_log_user_time;
DROP INDEX IF EXISTS idx_audit_log_entity;
DROP INDEX IF EXISTS idx_audit_log_action_time;
DROP INDEX IF EXISTS idx_rate_limits_window_start;
DROP INDEX IF EXISTS idx_sync_health_user_time;
DROP INDEX IF EXISTS idx_recurring_templates_next_due;
DROP INDEX IF EXISTS idx_recurring_templates_household;

-- =============================================================================
-- Phase 2: Restore original single-column indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_transactions_household ON transactions (household_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_active ON transactions (household_id, date)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_household ON accounts (household_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts (type);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_household ON budgets (household_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets (category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets (period);
CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_goals_household ON goals (household_id);
CREATE INDEX IF NOT EXISTS idx_goals_active ON goals (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_categories_household ON categories (household_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members (household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_sync_health_logs_user_created
    ON sync_health_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

CREATE INDEX IF NOT EXISTS idx_recurring_templates_household
    ON recurring_transaction_templates (household_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_next_due
    ON recurring_transaction_templates (next_due_date)
    WHERE deleted_at IS NULL AND is_active = true;
