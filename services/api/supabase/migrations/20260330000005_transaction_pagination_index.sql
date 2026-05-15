-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260330000005_transaction_pagination_index
-- Description: Add composite index for cursor-based transaction pagination (#1383)
-- Issues: #1383
--
-- Supports efficient keyset pagination by (date, id) and (created_at, id).
-- These indexes enable cursor-based queries without OFFSET, providing
-- consistent O(log n) performance regardless of page depth.

-- =============================================================================
-- Up
-- =============================================================================

-- Primary pagination index: date descending with id tiebreaker.
-- Used by the transactions-list Edge Function for default sorting.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_pagination_date
    ON transactions (date DESC, id DESC)
    WHERE deleted_at IS NULL;

-- Secondary pagination index: created_at descending with id tiebreaker.
-- Used when sorting by creation time.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_pagination_created_at
    ON transactions (created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

-- Tertiary pagination index: amount_cents descending with id tiebreaker.
-- Used when sorting by amount.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_pagination_amount
    ON transactions (amount_cents DESC, id DESC)
    WHERE deleted_at IS NULL;
