-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- DOWN Migration: 20260403000001_bank_connection_cap (#4379)
-- =============================================================================
-- Removes the per-household bank connection cap trigger.
--
-- WARNING: reverting restores the unbounded state described in
-- docs/business/revenue/aggregator-cost-strategy.md §3 — any authenticated user
-- can create unlimited billable aggregator Items. Only revert if the
-- application-level cap in bank-entitlements.ts is known to be active.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_bank_connections_cap ON bank_connections;
DROP FUNCTION IF EXISTS enforce_bank_connection_cap();
DROP INDEX IF EXISTS idx_bank_connections_household_live;
