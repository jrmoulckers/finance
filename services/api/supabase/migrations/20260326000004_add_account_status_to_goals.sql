-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260326000004_add_account_status_to_goals
-- Description: Add account_id and status columns to goals table
-- Issues: #866
--
-- Changes:
--   1. Add account_id UUID — nullable FK to accounts, links a goal to a specific savings account
--   2. Add status TEXT — tracks goal lifecycle: 'active', 'completed', 'archived'
--   3. Add CHECK constraint on status
--   4. Add index on account_id for efficient joins
--   5. Add index on status for filtering
--
-- This enables:
--   - Linking goals to specific savings accounts for automatic progress tracking
--   - Tracking goal lifecycle (active → completed/archived)
--   - Querying goals by status (e.g. show only active goals)
--
-- Security: No RLS changes needed — existing household-scoped policies cover
-- all operations on goals. The account_id FK is within the same household
-- (enforced by the application layer + the fact that accounts are household-scoped).
--
-- DOWN migration: at the bottom.

-- =============================================================================
-- UP
-- =============================================================================

-- 1. Link goal to a specific account (nullable — not all goals are account-linked)
ALTER TABLE goals
    ADD COLUMN account_id UUID REFERENCES accounts(id);

COMMENT ON COLUMN goals.account_id IS
    'Optional FK to the savings account funding this goal. NULL for goals not tied to a specific account.';

-- 2. Goal lifecycle status
ALTER TABLE goals
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE goals
    ADD CONSTRAINT chk_goals_status
    CHECK (status IN ('active', 'completed', 'archived'));

COMMENT ON COLUMN goals.status IS
    'Goal lifecycle: active (in progress), completed (target reached), archived (abandoned/paused).';

-- 3. Indexes
CREATE INDEX idx_goals_account
    ON goals (account_id)
    WHERE account_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_goals_status
    ON goals (status)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- DOWN (to revert, run these statements)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_goals_status;
-- DROP INDEX IF EXISTS idx_goals_account;
-- ALTER TABLE goals DROP CONSTRAINT IF EXISTS chk_goals_status;
-- ALTER TABLE goals DROP COLUMN IF EXISTS status;
-- ALTER TABLE goals DROP COLUMN IF EXISTS account_id;
