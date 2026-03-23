-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260323000001_cleanup_and_balance_triggers
-- Description: Add scheduled cleanup function and account balance recalculation trigger
-- Issues: #609
--
-- This migration adds two server-side functions:
--   1. cleanup_expired_records()  — housekeeping function for stale data
--   2. recalculate_account_balance() — trigger that keeps accounts.balance_cents in sync
--
-- DOWN migration: commented at the bottom for reversibility.

-- =============================================================================
-- 1. Scheduled cleanup for expired WebAuthn challenges and invitations (#609)
-- =============================================================================
-- Designed to be called by pg_cron (e.g. daily) or a scheduled Edge Function.
-- Returns a JSONB summary of how many rows were cleaned up.
--
-- Cleanup rules:
--   - webauthn_challenges: hard-delete rows expired > 1 hour ago (5-min TTL + safety margin)
--   - household_invitations:
--       a) Accepted AND expired > 7 days  → completed lifecycle, safe to purge
--       b) Never accepted AND expired > 30 days → abandoned invitation
--       c) Soft-deleted > 30 days → retention period elapsed
--
-- Security: SECURITY DEFINER so it can bypass RLS. Only service_role can execute.

CREATE OR REPLACE FUNCTION public.cleanup_expired_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  challenges_deleted INTEGER;
  invitations_deleted INTEGER;
BEGIN
  -- Delete expired WebAuthn challenges (expired > 1 hour ago for safety margin)
  DELETE FROM webauthn_challenges
  WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS challenges_deleted = ROW_COUNT;

  -- Hard-delete invitations that are:
  --   1. Expired AND accepted (completed lifecycle, 7-day grace period)
  --   2. Expired for more than 30 days AND never accepted (abandoned)
  --   3. Soft-deleted for more than 30 days (retention period elapsed)
  DELETE FROM household_invitations
  WHERE (
    (accepted_at IS NOT NULL AND expires_at < now() - interval '7 days')
    OR (accepted_at IS NULL AND expires_at < now() - interval '30 days')
    OR (deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days')
  );
  GET DIAGNOSTICS invitations_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'challenges_deleted', challenges_deleted,
    'invitations_deleted', invitations_deleted,
    'cleaned_at', now()
  );
END;
$$;

-- Only service_role can call cleanup (Edge Function or pg_cron via service key)
GRANT EXECUTE ON FUNCTION public.cleanup_expired_records() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_records() FROM PUBLIC;

-- =============================================================================
-- 2. Account balance recalculation trigger (#609)
-- =============================================================================
-- Keeps accounts.balance_cents in sync with the sum of CLEARED transactions.
--
-- Fired AFTER INSERT, UPDATE, or DELETE on the transactions table.
-- Handles:
--   - New transactions (INSERT)
--   - Modified transactions (UPDATE), including account_id changes
--   - Deleted transactions (DELETE), including soft-delete via UPDATE
--
-- Balance logic:
--   INCOME / TRANSFER_IN  → positive (add to balance)
--   EXPENSE / TRANSFER_OUT → negative (subtract from balance)
--   Only CLEARED transactions count (PENDING, VOID are excluded)
--
-- Security: SECURITY DEFINER so the trigger can update accounts even when
-- the current user's RLS policy would not permit direct account writes.

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
    -- INSERT
    target_account_id := NEW.account_id;
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

  UPDATE accounts SET balance_cents = new_balance WHERE id = target_account_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalculate_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_account_balance();

-- =============================================================================
-- DOWN (to revert this migration, run the following statements)
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_recalculate_balance ON transactions;
-- DROP FUNCTION IF EXISTS public.recalculate_account_balance();
-- DROP FUNCTION IF EXISTS public.cleanup_expired_records();
