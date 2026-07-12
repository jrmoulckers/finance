-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Biometric-protection sync filtering — transactions denormalization (#3530)
-- =============================================================================
-- Follow-up to #3528/#3529. PowerSync sync-rule DATA queries must select from a
-- single table (no JOINs) and may not reference token_parameters. A transaction's
-- protection status lives on its category (categories.is_biometric_protected),
-- which a single-table transactions query cannot see. We therefore DENORMALIZE
-- the flag onto transactions so the sync rules can filter protected rows to their
-- owner only, exactly as they do for categories.
--
-- Invariant maintained by triggers below:
--   transactions.is_biometric_protected =
--     COALESCE((SELECT is_biometric_protected FROM categories
--               WHERE categories.id = transactions.category_id), false)
--
-- A transaction with no category is treated as NOT protected.
-- =============================================================================

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS is_biometric_protected BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN transactions.is_biometric_protected IS
    'Denormalized from the transaction''s category (categories.is_biometric_protected). '
    'When true, the transaction must sync only to its owner, never to other household '
    'members. Kept in sync by trg_txn_biometric_from_category (on transactions) and '
    'trg_category_biometric_propagate (on categories). See #3530.';

-- Filtering index mirrors idx_categories_biometric_protected so the sync-rule
-- predicate (household_id, is_biometric_protected) stays cheap.
CREATE INDEX IF NOT EXISTS idx_transactions_biometric_protected
    ON transactions (household_id, is_biometric_protected)
    WHERE deleted_at IS NULL;

-- Owner-scoped lookup used by the user_profile bucket's protected-transactions query.
CREATE INDEX IF NOT EXISTS idx_transactions_owner_biometric
    ON transactions (owner_id, is_biometric_protected)
    WHERE deleted_at IS NULL AND is_biometric_protected = true;

-- -----------------------------------------------------------------------------
-- 1. Keep a transaction's flag correct when the transaction is written.
--    Runs BEFORE INSERT/UPDATE so the stored row already carries the right value.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_transaction_biometric_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.category_id IS NULL THEN
        NEW.is_biometric_protected := false;
    ELSE
        SELECT COALESCE(c.is_biometric_protected, false)
          INTO NEW.is_biometric_protected
          FROM categories c
         WHERE c.id = NEW.category_id;

        -- Category missing (should not happen given the FK) → not protected.
        IF NEW.is_biometric_protected IS NULL THEN
            NEW.is_biometric_protected := false;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_txn_biometric_from_category ON public.transactions;

CREATE TRIGGER trg_txn_biometric_from_category
    BEFORE INSERT OR UPDATE OF category_id ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_transaction_biometric_flag();

-- -----------------------------------------------------------------------------
-- 2. Propagate a category's protection change to all of its transactions.
--    Runs AFTER UPDATE when is_biometric_protected actually changes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.propagate_category_biometric_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE transactions
       SET is_biometric_protected = NEW.is_biometric_protected,
           updated_at = now()
     WHERE category_id = NEW.id
       AND is_biometric_protected IS DISTINCT FROM NEW.is_biometric_protected;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_category_biometric_propagate ON public.categories;

CREATE TRIGGER trg_category_biometric_propagate
    AFTER UPDATE OF is_biometric_protected ON public.categories
    FOR EACH ROW
    WHEN (OLD.is_biometric_protected IS DISTINCT FROM NEW.is_biometric_protected)
    EXECUTE FUNCTION public.propagate_category_biometric_flag();

-- -----------------------------------------------------------------------------
-- 3. One-time backfill so existing rows carry the correct value immediately.
-- -----------------------------------------------------------------------------
UPDATE transactions t
   SET is_biometric_protected = COALESCE(c.is_biometric_protected, false)
  FROM categories c
 WHERE t.category_id = c.id
   AND t.is_biometric_protected IS DISTINCT FROM COALESCE(c.is_biometric_protected, false);
