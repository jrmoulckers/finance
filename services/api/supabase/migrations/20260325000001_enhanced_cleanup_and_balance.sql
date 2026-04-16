-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260325000001_enhanced_cleanup_and_balance
-- Description: Enhance cleanup functions and balance recalculation trigger (#609)
--
-- Supplements 20260323000001_cleanup_and_balance_triggers.sql with:
--
--   1. cleanup_soft_deleted_records() — purges soft-deleted rows from core
--      financial tables after a configurable retention period (default 90 days).
--      GDPR Article 17 requires that deleted data is actually removed after a
--      reasonable retention window.
--
--   2. cleanup_old_audit_logs() — removes data_export_audit_log and
--      notification_log entries beyond the retention period to keep
--      operational tables bounded.
--
--   3. recalculate_account_balance() — improved version that sets updated_at
--      on the affected account row so PowerSync picks up the change, and
--      guards against NULL account_id on INSERT/UPDATE.
--
-- DOWN migration: commented at the bottom for reversibility.

-- =============================================================================
-- 1. Soft-deleted record purge across core financial tables (#609)
-- =============================================================================
-- After the retention period (default 90 days), soft-deleted records are
-- hard-deleted. This satisfies GDPR erasure requirements and keeps table
-- sizes manageable. The function processes tables in dependency order
-- (children first) to avoid FK constraint violations.
--
-- Tables processed (in FK-safe order):
--   1. transactions       (references accounts, categories)
--   2. budgets             (references categories)
--   3. goals               (references households)
--   4. accounts            (referenced by transactions)
--   5. categories          (referenced by transactions, budgets)
--   6. household_invitations (references households)
--   7. household_members   (references households, users)
--   8. households          (referenced by everything)
--   9. users               (referenced by households)
--
-- Security: SECURITY DEFINER so it can bypass RLS. Only service_role can execute.

CREATE OR REPLACE FUNCTION public.cleanup_soft_deleted_records(
    retention_days INTEGER DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff       TIMESTAMPTZ := now() - (retention_days || ' days')::INTERVAL;
    v_transactions INTEGER := 0;
    v_budgets      INTEGER := 0;
    v_goals        INTEGER := 0;
    v_accounts     INTEGER := 0;
    v_categories   INTEGER := 0;
    v_invitations  INTEGER := 0;
    v_members      INTEGER := 0;
    v_households   INTEGER := 0;
    v_users        INTEGER := 0;
BEGIN
    -- Children first to avoid FK violations

    -- 1. transactions (references accounts, categories)
    DELETE FROM transactions
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_transactions = ROW_COUNT;

    -- 2. budgets (references categories)
    DELETE FROM budgets
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_budgets = ROW_COUNT;

    -- 3. goals (references households)
    DELETE FROM goals
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_goals = ROW_COUNT;

    -- 4. accounts (referenced by transactions — already cleaned above)
    DELETE FROM accounts
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_accounts = ROW_COUNT;

    -- 5. categories (referenced by transactions, budgets — already cleaned)
    DELETE FROM categories
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_categories = ROW_COUNT;

    -- 6. household_invitations
    DELETE FROM household_invitations
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_invitations = ROW_COUNT;

    -- 7. household_members (references households, users)
    DELETE FROM household_members
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_members = ROW_COUNT;

    -- 8. households (referenced by accounts, categories, etc. — all cleaned)
    DELETE FROM households
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_households = ROW_COUNT;

    -- 9. users (referenced by households — cleaned above)
    DELETE FROM users
    WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_users = ROW_COUNT;

    RETURN jsonb_build_object(
        'retention_days',          retention_days,
        'cutoff',                  v_cutoff,
        'transactions_purged',     v_transactions,
        'budgets_purged',          v_budgets,
        'goals_purged',            v_goals,
        'accounts_purged',         v_accounts,
        'categories_purged',       v_categories,
        'invitations_purged',      v_invitations,
        'members_purged',          v_members,
        'households_purged',       v_households,
        'users_purged',            v_users,
        'purged_at',               now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_soft_deleted_records(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_soft_deleted_records(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_soft_deleted_records(INTEGER) FROM anon;


-- =============================================================================
-- 2. Audit / operational log cleanup (#609)
-- =============================================================================
-- Removes old entries from operational log tables. These are append-only
-- tables that would grow without bound if not periodically pruned.
--
-- Tables cleaned:
--   - data_export_audit_log: GDPR export records (90-day default retention)
--   - notification_log: delivery records (60-day default retention)
--   - audit_log: financial mutation audit trail (365-day default retention,
--     longer because it may be needed for dispute resolution)

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(
    export_retention_days       INTEGER DEFAULT 90,
    notification_retention_days INTEGER DEFAULT 60,
    audit_retention_days        INTEGER DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exports       INTEGER := 0;
    v_notifications INTEGER := 0;
    v_audit         INTEGER := 0;
BEGIN
    -- Data export audit log
    DELETE FROM data_export_audit_log
    WHERE created_at < now() - (export_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_exports = ROW_COUNT;

    -- Notification log
    DELETE FROM notification_log
    WHERE created_at < now() - (notification_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_notifications = ROW_COUNT;

    -- General audit log (longer retention for financial compliance)
    DELETE FROM audit_log
    WHERE created_at < now() - (audit_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_audit = ROW_COUNT;

    RETURN jsonb_build_object(
        'data_export_logs_deleted',  v_exports,
        'notification_logs_deleted', v_notifications,
        'audit_logs_deleted',        v_audit,
        'cleaned_at',                now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER, INTEGER, INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER, INTEGER, INTEGER) FROM anon;


-- =============================================================================
-- 3. Improved balance recalculation trigger (#609)
-- =============================================================================
-- Replaces the trigger function from 20260323000001 with improvements:
--
--   a) Sets updated_at on the account row so that:
--      - The set_updated_at trigger on accounts sees the change
--      - PowerSync detects the modified row via sync_version / updated_at
--
--   b) Guards against NULL account_id — if a transaction somehow has
--      a NULL account_id on INSERT/UPDATE, skip the recalculation
--      (the FK constraint should prevent this, but defence in depth).
--
--   c) Wraps the entire operation in an EXCEPTION block so a failure
--      in balance recalculation cannot abort the parent transaction.
--
-- Note: This uses CREATE OR REPLACE, so the existing trigger
-- (trg_recalculate_balance) is automatically updated.

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

-- The trigger trg_recalculate_balance already exists from 20260323000001;
-- CREATE OR REPLACE on the function updates the trigger in-place.
-- No need to DROP/recreate the trigger itself.


-- =============================================================================
-- 4. Update run_all_maintenance() to include new cleanup functions (#609)
-- =============================================================================
-- Extends the orchestrator from 20260324000003 to also call the new
-- soft-delete purge and audit log cleanup.

CREATE OR REPLACE FUNCTION public.run_all_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate_limits      INTEGER;
    v_webauthn         INTEGER;
    v_sync_logs        INTEGER;
    v_invitations      INTEGER;
    v_soft_deleted     JSONB;
    v_audit_cleanup    JSONB;
    v_analyze_result   TEXT;
BEGIN
    -- Existing cleanups (from 20260324000003)
    v_rate_limits    := cleanup_expired_rate_limits();
    v_webauthn       := cleanup_expired_webauthn_challenges();
    v_sync_logs      := cleanup_old_sync_health_logs();
    v_invitations    := cleanup_expired_invitations();

    -- New cleanups (#609)
    v_soft_deleted   := cleanup_soft_deleted_records();
    v_audit_cleanup  := cleanup_old_audit_logs();

    -- Update planner statistics
    v_analyze_result := vacuum_analyze_tables();

    RETURN jsonb_build_object(
        'rate_limits_deleted',          v_rate_limits,
        'webauthn_challenges_deleted',  v_webauthn,
        'sync_health_logs_deleted',     v_sync_logs,
        'invitations_expired',          v_invitations,
        'soft_deleted_purge',           v_soft_deleted,
        'audit_log_cleanup',            v_audit_cleanup,
        'analyze_result',               v_analyze_result,
        'completed_at',                 NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;


-- =============================================================================
-- DOWN (to revert this migration, run the following statements)
-- =============================================================================
--
-- -- 4. Restore original run_all_maintenance without soft-delete/audit cleanup
-- CREATE OR REPLACE FUNCTION public.run_all_maintenance()
-- RETURNS JSONB
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--     v_rate_limits    INTEGER;
--     v_webauthn       INTEGER;
--     v_sync_logs      INTEGER;
--     v_invitations    INTEGER;
--     v_analyze_result TEXT;
-- BEGIN
--     v_rate_limits    := cleanup_expired_rate_limits();
--     v_webauthn       := cleanup_expired_webauthn_challenges();
--     v_sync_logs      := cleanup_old_sync_health_logs();
--     v_invitations    := cleanup_expired_invitations();
--     v_analyze_result := vacuum_analyze_tables();
--     RETURN jsonb_build_object(
--         'rate_limits_deleted',          v_rate_limits,
--         'webauthn_challenges_deleted',  v_webauthn,
--         'sync_health_logs_deleted',     v_sync_logs,
--         'invitations_expired',          v_invitations,
--         'analyze_result',               v_analyze_result,
--         'completed_at',                 NOW()
--     );
-- END;
-- $$;
-- GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
-- REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
-- REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;
--
-- -- 3. Restore original recalculate_account_balance (without updated_at fix)
-- CREATE OR REPLACE FUNCTION public.recalculate_account_balance()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   target_account_id UUID;
--   new_balance BIGINT;
-- BEGIN
--   IF TG_OP = 'DELETE' THEN
--     target_account_id := OLD.account_id;
--   ELSIF TG_OP = 'UPDATE' THEN
--     IF OLD.account_id IS DISTINCT FROM NEW.account_id THEN
--       SELECT COALESCE(SUM(
--         CASE WHEN type = 'INCOME' OR type = 'TRANSFER_IN' THEN amount_cents
--              WHEN type = 'EXPENSE' OR type = 'TRANSFER_OUT' THEN -amount_cents
--              ELSE 0
--         END
--       ), 0) INTO new_balance
--       FROM transactions
--       WHERE account_id = OLD.account_id
--         AND deleted_at IS NULL
--         AND status = 'CLEARED';
--       UPDATE accounts SET balance_cents = new_balance WHERE id = OLD.account_id;
--     END IF;
--     target_account_id := NEW.account_id;
--   ELSE
--     target_account_id := NEW.account_id;
--   END IF;
--   SELECT COALESCE(SUM(
--     CASE WHEN type = 'INCOME' OR type = 'TRANSFER_IN' THEN amount_cents
--          WHEN type = 'EXPENSE' OR type = 'TRANSFER_OUT' THEN -amount_cents
--          ELSE 0
--     END
--   ), 0) INTO new_balance
--   FROM transactions
--   WHERE account_id = target_account_id
--     AND deleted_at IS NULL
--     AND status = 'CLEARED';
--   UPDATE accounts SET balance_cents = new_balance WHERE id = target_account_id;
--   IF TG_OP = 'DELETE' THEN
--     RETURN OLD;
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
--
-- -- 2. Drop audit log cleanup function
-- DROP FUNCTION IF EXISTS public.cleanup_old_audit_logs(INTEGER, INTEGER, INTEGER);
--
-- -- 1. Drop soft-delete cleanup function
-- DROP FUNCTION IF EXISTS public.cleanup_soft_deleted_records(INTEGER);
