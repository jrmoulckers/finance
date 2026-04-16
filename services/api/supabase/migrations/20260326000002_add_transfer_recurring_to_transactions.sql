-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260326000002_add_transfer_recurring_to_transactions
-- Description: Add transfer_transaction_id and recurring_rule_id to transactions
-- Issues: #866
--
-- Changes:
--   1. Add transfer_transaction_id UUID — nullable self-FK linking transfer pairs
--   2. Add recurring_rule_id UUID — nullable FK to recurring_transaction_templates
--   3. Add indexes for efficient lookups
--
-- These columns enable:
--   - Linking the two sides of a transfer (debit + credit) via transfer_transaction_id
--   - Tracking which recurring template generated a transaction via recurring_rule_id
--
-- Security: No RLS changes needed — existing household-scoped policies cover
-- all SELECT/INSERT/UPDATE/DELETE operations on transactions. The new columns
-- are nullable FKs that don't change the row's household_id.
--
-- DOWN migration: at the bottom.

-- =============================================================================
-- UP
-- =============================================================================

-- 1. Self-referencing FK for transfer pairs
ALTER TABLE transactions
    ADD COLUMN transfer_transaction_id UUID REFERENCES transactions(id);

COMMENT ON COLUMN transactions.transfer_transaction_id IS
    'Self-FK linking the two sides of a transfer. The debit transaction points to the credit, and vice versa.';

-- 2. FK to recurring template that generated this transaction
ALTER TABLE transactions
    ADD COLUMN recurring_rule_id UUID REFERENCES recurring_transaction_templates(id);

COMMENT ON COLUMN transactions.recurring_rule_id IS
    'FK to the recurring_transaction_templates row that generated this transaction (NULL for manual transactions).';

-- 3. Indexes for efficient lookups
CREATE INDEX idx_transactions_transfer_pair
    ON transactions (transfer_transaction_id)
    WHERE transfer_transaction_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_transactions_recurring_rule
    ON transactions (recurring_rule_id)
    WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL;

-- =============================================================================
-- DOWN (to revert, run these statements)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_transactions_recurring_rule;
-- DROP INDEX IF EXISTS idx_transactions_transfer_pair;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS recurring_rule_id;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS transfer_transaction_id;
