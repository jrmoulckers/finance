-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- DOWN Migration: 20260908000001_bank_connection_cap_remediation (Refs #4404)
-- =============================================================================
-- Restores the 20260906000003 shapes: the expiry-blind cap rule, the 8-argument
-- finalization RPC, and the 5-argument orphan recorder with its original
-- two-state credential lifecycle.
--
-- WARNING — reverting REMOVES three protections:
--   1. A lapsed entitlement projection is honoured again, so a household whose
--      allowance has expired can reserve and finalize another billable Item.
--   2. Finalization stops being idempotent, so a caller that loses a finalize
--      response can revoke a provider Item that is already backing a live row.
--   3. Orphan credentials become unbounded again and stop participating in
--      account deletion.
--   4. Retention stops being enforced: the dedicated cron job is unscheduled
--      and `run_all_maintenance()` no longer purges expired orphan rows, so a
--      credential past its ceiling is retained indefinitely.
--
-- Revert only after redeploying `bank-connection` and `account-delete` to the
-- pre-remediation revision. The bank-connection revision that ships with this
-- migration calls `bank_connection_finalization_state` and the 9-argument
-- finalize; the account-delete revision calls the erasure RPCs. Reverting
-- underneath either revision breaks the exchange and deletion paths.
--
-- DATA NOTE: terminal orphan rows created by this migration hold no credential
-- (that is the point — the credential was destroyed on disposition). The
-- restored NOT NULL constraint cannot represent them, so they are deleted
-- below. They are already dispositioned and carry no revocation capability;
-- only their audit trail is lost.
-- =============================================================================

-- Restore the expiry-blind allowance rule from 20260906000003.
CREATE OR REPLACE FUNCTION public.bank_connection_cap_for_household(p_household_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT bank_connection_allowance
            FROM current_household_entitlements
            WHERE household_id = p_household_id
        ),
        0::BIGINT
    );
$$;

COMMENT ON FUNCTION public.bank_connection_cap_for_household(UUID) IS
    'Sole bank connection allowance rule (#4404). Returns the household bank '
    'allowance from the minimized entitlement projection (Stage 5); 0 when no '
    'projection row exists. Never trusts a client tier, flag, cache, or '
    'requested cap. The Edge Function and the cap trigger both resolve through '
    'this function so they cannot disagree.';

-- Unschedule the dedicated retention job and restore the orchestrator to its
-- 20260330000005 shape. Both must happen BEFORE the purge function is dropped,
-- so nothing is left calling a function that no longer exists.
DO $maint$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-orphaned-bank-items') THEN
            PERFORM cron.unschedule('purge-orphaned-bank-items');
        END IF;
    END IF;
END $maint$;

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
    v_audit_logs     INTEGER;
    v_analyze_result TEXT;
BEGIN
    v_rate_limits    := cleanup_expired_rate_limits();
    v_webauthn       := cleanup_expired_webauthn_challenges();
    v_sync_logs      := cleanup_old_sync_health_logs();
    v_invitations    := cleanup_expired_invitations();
    v_audit_logs     := cleanup_old_audit_logs();

    v_analyze_result := vacuum_analyze_tables();

    RETURN jsonb_build_object(
        'rate_limits_deleted',          v_rate_limits,
        'webauthn_challenges_deleted',  v_webauthn,
        'sync_health_logs_deleted',     v_sync_logs,
        'invitations_expired',          v_invitations,
        'audit_logs_deleted',           v_audit_logs,
        'analyze_result',               v_analyze_result,
        'completed_at',                 NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;

-- Drop the remediation-only RPCs.
DROP FUNCTION IF EXISTS public.purge_expired_orphaned_bank_items(INTERVAL);
DROP FUNCTION IF EXISTS public.claim_orphaned_bank_items_for_erasure(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.record_orphaned_bank_item_attempt(UUID, TEXT);
DROP FUNCTION IF EXISTS public.complete_orphaned_bank_item(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.bank_connection_finalization_state(UUID, UUID);

-- Restore the 8-argument finalization RPC.
DROP FUNCTION IF EXISTS public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID
);

CREATE FUNCTION public.finalize_bank_connection_reservation(
    p_reservation_id UUID,
    p_household_id UUID,
    p_owner_id UUID,
    p_provider TEXT,
    p_institution_id TEXT,
    p_institution_name TEXT,
    p_encrypted_access_token TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    status        TEXT,
    connection_id UUID,
    created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reservation bank_connection_reservations%ROWTYPE;
    v_cap         BIGINT;
    v_live        BIGINT;
    v_reserved    BIGINT;
    v_id          UUID;
    v_created_at  TIMESTAMPTZ;
BEGIN
    IF p_provider IS NULL OR p_provider NOT IN ('plaid', 'mx') THEN
        RAISE EXCEPTION 'invalid provider' USING ERRCODE = 'check_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    DELETE FROM bank_connection_reservations
    WHERE household_id = p_household_id
      AND expires_at <= now()
      AND id <> p_reservation_id;

    SELECT * INTO v_reservation
    FROM bank_connection_reservations
    WHERE id = p_reservation_id AND household_id = p_household_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'reservation_not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    DELETE FROM bank_connection_reservations WHERE id = p_reservation_id;

    v_cap := bank_connection_cap_for_household(p_household_id);

    SELECT count(*) INTO v_live
    FROM bank_connections
    WHERE household_id = p_household_id AND deleted_at IS NULL;

    SELECT count(*) INTO v_reserved
    FROM bank_connection_reservations
    WHERE household_id = p_household_id AND expires_at > now();

    IF v_cap <= 0 THEN
        RETURN QUERY SELECT 'premium_required'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF (v_live + v_reserved) >= v_cap THEN
        RETURN QUERY SELECT 'at_cap'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    INSERT INTO bank_connections (
        household_id,
        owner_id,
        provider,
        institution_id,
        institution_name,
        encrypted_access_token,
        status,
        metadata
    )
    VALUES (
        p_household_id,
        p_owner_id,
        p_provider,
        p_institution_id,
        p_institution_name,
        p_encrypted_access_token,
        'active',
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id, bank_connections.created_at INTO v_id, v_created_at;

    RETURN QUERY SELECT 'finalized'::TEXT, v_id, v_created_at;
END;
$$;

COMMENT ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) IS
    'Consumes a reservation and inserts the bank connection row in one locked '
    'transaction (#4404). Returns finalized / at_cap / premium_required / '
    'reservation_not_found. On any non-finalized outcome the caller must revoke '
    'the provider Item.';

REVOKE EXECUTE ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

-- Restore the 5-argument orphan recorder.
DROP FUNCTION IF EXISTS public.record_orphaned_bank_item(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
);

CREATE FUNCTION public.record_orphaned_bank_item(
    p_household_id UUID,
    p_owner_id UUID,
    p_provider TEXT,
    p_encrypted_access_token TEXT,
    p_last_error_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_provider IS NULL OR p_provider NOT IN ('plaid', 'mx') THEN
        RAISE EXCEPTION 'invalid provider' USING ERRCODE = 'check_violation';
    END IF;
    IF p_encrypted_access_token IS NULL OR btrim(p_encrypted_access_token) = '' THEN
        RAISE EXCEPTION 'encrypted access token is required to retain revocation capability'
            USING ERRCODE = 'not_null_violation';
    END IF;

    INSERT INTO bank_connection_orphaned_items (
        household_id,
        owner_id,
        provider,
        encrypted_access_token,
        attempts,
        last_error_code
    )
    VALUES (
        p_household_id,
        p_owner_id,
        p_provider,
        p_encrypted_access_token,
        1,
        p_last_error_code
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT) IS
    'Durably records a billable provider Item awaiting revocation retry (#4404), '
    'retaining its encrypted credential. Rejects an empty credential so the '
    'revocation capability is never lost.';

REVOKE EXECUTE ON FUNCTION public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT)
    TO service_role;

-- Restore the two-state credential lifecycle. Rows the restored shape cannot
-- represent are removed first (see the DATA NOTE above).
DELETE FROM bank_connection_orphaned_items
WHERE status IN ('revoked', 'abandoned')
   OR encrypted_access_token IS NULL;

UPDATE bank_connection_orphaned_items
SET status = 'pending_revocation'
WHERE status = 'pending_reconciliation';

DROP INDEX IF EXISTS idx_bank_connection_orphaned_items_household;
DROP INDEX IF EXISTS idx_bank_connection_orphaned_items_owner;
DROP INDEX IF EXISTS idx_bank_connection_orphaned_items_terminal;
DROP INDEX IF EXISTS idx_bank_connection_orphaned_items_open;

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT IF EXISTS bank_connection_orphaned_items_terminal_check;
ALTER TABLE bank_connection_orphaned_items
    ADD CONSTRAINT bank_connection_orphaned_items_revoked_check CHECK (
        (status = 'revoked' AND revoked_at IS NOT NULL)
        OR (status = 'pending_revocation' AND revoked_at IS NULL)
    );

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT IF EXISTS bank_connection_orphaned_items_status_valid;
ALTER TABLE bank_connection_orphaned_items
    ADD CONSTRAINT bank_connection_orphaned_items_status_valid CHECK (
        status IN ('pending_revocation', 'revoked')
    );

ALTER TABLE bank_connection_orphaned_items
    ALTER COLUMN encrypted_access_token SET NOT NULL,
    DROP COLUMN retain_until,
    DROP COLUMN erasure_requested_at,
    DROP COLUMN connection_id;

CREATE INDEX idx_bank_connection_orphaned_items_pending
    ON bank_connection_orphaned_items (created_at)
    WHERE status = 'pending_revocation';

COMMENT ON TABLE bank_connection_orphaned_items IS
    'Server-only durable handoff (#4404) for a provider Item that became '
    'billable but could not be finalized or immediately revoked. Retains the '
    'encrypted credential so Stage 7 can retry an idempotent revocation without '
    'losing the revocation capability. Never client-readable and never synced.';
