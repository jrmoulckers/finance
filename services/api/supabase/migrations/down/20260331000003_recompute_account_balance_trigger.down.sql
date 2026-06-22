-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260331000003_recompute_account_balance_trigger
-- Description: Revert the signed-sum balance recompute helper + trigger function
-- Issues: #2881
--
-- Reversal of services/api/supabase/migrations/20260331000003_recompute_account_balance_trigger.sql.
--
-- The up migration:
--   1. Created a NEW helper recompute_account_balance_cents(UUID) that derives
--      accounts.balance_cents as SUM(amount_cents) of non-deleted transactions.
--   2. Replaced recalculate_account_balance() (which already existed since
--      20260323000001 and was last redefined by 20260325000001) so the trigger
--      delegates to that helper.
--   3. Dropped and recreated the trg_recalculate_balance trigger (its
--      definition was unchanged) and ran a one-time backfill of balances.
--
-- This down migration restores the IMMEDIATELY-PRIOR state (20260325000001):
--   1. Restores recalculate_account_balance() to the 20260325000001 "enhanced"
--      definition (CASE-based signed sum over CLEARED, non-deleted rows, with
--      updated_at write-through and NULL account_id guard).
--   2. Re-points the trg_recalculate_balance trigger at the restored function.
--   3. Drops the genuinely-new recompute_account_balance_cents(UUID) helper.
--
-- NOTE: recalculate_account_balance() and trg_recalculate_balance PRE-DATE this
-- migration, so they are RESTORED (not dropped) to avoid leaving accounts with
-- no balance-maintenance trigger. Only recompute_account_balance_cents(UUID) is
-- dropped because it was newly introduced by the up migration.
--
-- TODO(human): The up migration's one-time backfill (UPDATE accounts SET
-- balance_cents = SUM(amount_cents)) overwrote stored balances and is NOT
-- reversible — the pre-backfill balance values are not retained anywhere.
-- After rollback, the restored CLEARED-only trigger will recompute balances on
-- the next write per account; review whether a manual recompute pass is needed
-- so balances match the restored (CLEARED-only) semantics immediately.

-- =============================================================================
-- 1. Restore recalculate_account_balance() to the 20260325000001 definition.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_account_id UUID;
  new_balance BIGINT;
BEGIN
  -- Determine which account to recalculate
  IF TG_OP = 'DELETE' THEN
    target_account_id := OLD.account_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If account_id changed, recalculate the old account first
    IF OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      IF OLD.account_id IS NOT NULL THEN
        SELECT COALESCE(SUM(
          CASE WHEN type = 'INCOME' OR type = 'TRANSFER_IN' THEN amount_cents
               WHEN type = 'EXPENSE' OR type = 'TRANSFER_OUT' THEN -amount_cents
               ELSE 0
          END
        ), 0) INTO new_balance
        FROM transactions
        WHERE account_id = OLD.account_id
          AND deleted_at IS NULL
          AND status = 'CLEARED';

        UPDATE accounts
        SET balance_cents = new_balance,
            updated_at = now()
        WHERE id = OLD.account_id;
      END IF;
    END IF;
    target_account_id := NEW.account_id;
  ELSE
    -- INSERT
    target_account_id := NEW.account_id;
  END IF;

  -- Guard: skip if target account is NULL (defence in depth)
  IF target_account_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Recalculate target account balance from all CLEARED, non-deleted transactions
  SELECT COALESCE(SUM(
    CASE WHEN type = 'INCOME' OR type = 'TRANSFER_IN' THEN amount_cents
         WHEN type = 'EXPENSE' OR type = 'TRANSFER_OUT' THEN -amount_cents
         ELSE 0
    END
  ), 0) INTO new_balance
  FROM transactions
  WHERE account_id = target_account_id
    AND deleted_at IS NULL
    AND status = 'CLEARED';

  UPDATE accounts
  SET balance_cents = new_balance,
      updated_at = now()
  WHERE id = target_account_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. Re-point the trigger at the restored function (definition unchanged).
-- =============================================================================
DROP TRIGGER IF EXISTS trg_recalculate_balance ON public.transactions;

CREATE TRIGGER trg_recalculate_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_account_balance();

-- =============================================================================
-- 3. Drop the helper introduced by the up migration.
-- =============================================================================
DROP FUNCTION IF EXISTS public.recompute_account_balance_cents(UUID);
