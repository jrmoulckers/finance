-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260326000003_add_rollover_to_budgets
-- Description: Add is_rollover column to budgets table
-- Issues: #866
--
-- Changes:
--   1. Add is_rollover BOOLEAN NOT NULL DEFAULT false
--
-- This enables carry-forward of unused budget amounts into the next period.
-- When is_rollover = true, unspent budget from the current period rolls into
-- the next period's allocation. The client-side logic computes the effective
-- budget as: current_period_amount + rollover_from_previous_period.
--
-- Security: No RLS changes needed — existing household-scoped policies cover
-- all operations on budgets. The new column doesn't change access patterns.
--
-- DOWN migration: at the bottom.

-- =============================================================================
-- UP
-- =============================================================================

ALTER TABLE budgets
    ADD COLUMN is_rollover BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN budgets.is_rollover IS
    'When true, unused budget from the current period carries forward into the next period.';

-- =============================================================================
-- DOWN (to revert, run this statement)
-- =============================================================================
-- ALTER TABLE budgets DROP COLUMN IF EXISTS is_rollover;
