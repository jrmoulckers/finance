-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260325000001_enhanced_cleanup_and_balance
-- Description: Revert enhanced cleanup functions and balance trigger
-- Issues: #893
--
-- Restores the original run_all_maintenance (without soft-delete/audit cleanup),
-- restores the original recalculate_account_balance (without updated_at fix),
-- and drops the new cleanup functions.

-- =============================================================================
-- 1. Restore original run_all_maintenance without soft-delete/audit cleanup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.run_all_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate_limits    INTEGER;
    v_webauthn       INTEGER;
    v_sync_logs      INTEGER;
    v_invitations    INTEGER;
    v_analyze_result TEXT;
BEGIN
    v_rate_limits    := cleanup_expired_rate_limits();
    v_webauthn       := cleanup_expired_webauthn_challenges();
    v_sync_logs      := cleanup_old_sync_health_logs();
    v_invitations    := cleanup_expired_invitations();
    v_analyze_result := vacuum_analyze_tables();
    RETURN jsonb_build_object(
        'rate_limits_deleted',          v_rate_limits,
        'webauthn_challenges_deleted',  v_webauthn,
        'sync_health_logs_deleted',     v_sync_logs,
        'invitations_expired',          v_invitations,
        'analyze_result',               v_analyze_result,
        'completed_at',                 NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;

-- =============================================================================
-- 2. Restore original recalculate_account_balance (without updated_at fix)
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
  IF TG_OP = 'DELETE' THEN
    target_account_id := OLD.account_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.account_id IS DISTINCT FROM NEW.account_id THEN
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
      UPDATE accounts SET balance_cents = new_balance WHERE id = OLD.account_id;
    END IF;
    target_account_id := NEW.account_id;
  ELSE
    target_account_id := NEW.account_id;
  END IF;
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
  UPDATE accounts SET balance_cents = new_balance WHERE id = target_account_id;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. Drop new cleanup functions
-- =============================================================================
DROP FUNCTION IF EXISTS public.cleanup_old_audit_logs(INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.cleanup_soft_deleted_records(INTEGER);
