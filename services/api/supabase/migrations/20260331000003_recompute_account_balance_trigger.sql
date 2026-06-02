-- SPDX-License-Identifier: BUSL-1.1

-- Keep account balances derived from non-deleted transactions.
-- The cloud schema stores this as accounts.balance_cents (the web/local name is current_balance).
-- Transaction amounts are signed cents in the shared model/seed data, so balances are SUM(amount_cents).

CREATE OR REPLACE FUNCTION public.recompute_account_balance_cents(target_account_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE accounts
  SET balance_cents = (
        SELECT COALESCE(SUM(amount_cents), 0)::BIGINT
        FROM transactions
        WHERE account_id = target_account_id
          AND deleted_at IS NULL
      ),
      updated_at = now()
  WHERE id = target_account_id
    AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_account_balance_cents(OLD.account_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
    PERFORM public.recompute_account_balance_cents(OLD.account_id);
  END IF;

  PERFORM public.recompute_account_balance_cents(NEW.account_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_balance ON public.transactions;

CREATE TRIGGER trg_recalculate_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_account_balance();

-- Backfill existing accounts once so stale balances are corrected immediately.
UPDATE public.accounts AS account
SET balance_cents = (
      SELECT COALESCE(SUM(t.amount_cents), 0)::BIGINT
      FROM public.transactions AS t
      WHERE t.account_id = account.id
        AND t.deleted_at IS NULL
    ),
    updated_at = now()
WHERE account.deleted_at IS NULL;
