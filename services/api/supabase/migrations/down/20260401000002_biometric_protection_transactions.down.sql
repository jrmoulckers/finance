-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260401000002_biometric_protection_transactions
-- Description: Revert the denormalized transactions.is_biometric_protected column,
--              its maintenance triggers, and supporting indexes.
-- Issues: #3530
--
-- Reversal of
-- services/api/supabase/migrations/20260401000002_biometric_protection_transactions.sql.
--
-- NOTE: The up migration's one-time backfill set is_biometric_protected on existing
-- rows; dropping the column discards those values (they are re-derivable from
-- categories.is_biometric_protected, so no data is lost).

DROP TRIGGER IF EXISTS trg_category_biometric_propagate ON public.categories;
DROP FUNCTION IF EXISTS public.propagate_category_biometric_flag();

DROP TRIGGER IF EXISTS trg_txn_biometric_from_category ON public.transactions;
DROP FUNCTION IF EXISTS public.sync_transaction_biometric_flag();

DROP INDEX IF EXISTS idx_transactions_owner_biometric;
DROP INDEX IF EXISTS idx_transactions_biometric_protected;

ALTER TABLE transactions DROP COLUMN IF EXISTS is_biometric_protected;
