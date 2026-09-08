-- SPDX-License-Identifier: BUSL-1.1

-- Revert #4405 only after reverting the bank-connection, account-delete,
-- bank-webhook, and bank-revocation-worker Edge Functions.

DROP TRIGGER IF EXISTS trg_household_entitlement_bank_revocation
    ON current_household_entitlements;
DROP TRIGGER IF EXISTS trg_bank_connection_provider_lifecycle
    ON bank_connections;
DROP FUNCTION IF EXISTS public.guard_bank_connection_provider_lifecycle();

DROP FUNCTION IF EXISTS public.bank_revocation_reconciliation_status();
DROP FUNCTION IF EXISTS public.fail_bank_revocation_job(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.complete_bank_revocation_job(UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.resolve_bank_revocation_reconciliation(UUID, UUID);
DROP FUNCTION IF EXISTS public.claim_bank_revocation_jobs(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.reconcile_all_bank_connection_allowances(INTEGER);
DROP FUNCTION IF EXISTS public.reconcile_bank_connections_after_entitlement_change();
DROP FUNCTION IF EXISTS public.reconcile_bank_connections_to_allowance(UUID, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.enqueue_bank_revocations_for_erasure(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.enqueue_bank_connection_revocation(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.select_bank_connections_for_downgrade(UUID, UUID, TEXT, UUID[]);

DROP INDEX IF EXISTS idx_bank_connection_revocation_open_connection;
DROP INDEX IF EXISTS idx_bank_connection_revocation_dedupe;
DROP INDEX IF EXISTS idx_bank_connection_revocation_exhausted;
DROP INDEX IF EXISTS idx_bank_connection_revocation_due;

DELETE FROM bank_connection_orphaned_items
WHERE status = 'reconciled';

UPDATE bank_connection_orphaned_items
SET status = 'pending_revocation'
WHERE status IN ('pending_reconciliation', 'exhausted');

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT IF EXISTS bank_connection_orphaned_items_terminal_check,
    DROP CONSTRAINT IF EXISTS bank_connection_orphaned_items_status_valid,
    DROP CONSTRAINT IF EXISTS bank_connection_orphaned_items_error_safe,
    DROP CONSTRAINT IF EXISTS bank_connection_orphaned_items_claim_check;

ALTER TABLE bank_connection_orphaned_items
    ADD CONSTRAINT bank_connection_orphaned_items_status_valid CHECK (
        status IN ('pending_revocation', 'pending_reconciliation', 'revoked', 'abandoned')
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_terminal_check CHECK (
        (
            status IN ('pending_revocation', 'pending_reconciliation')
            AND revoked_at IS NULL
            AND encrypted_access_token IS NOT NULL
        )
        OR (
            status IN ('revoked', 'abandoned')
            AND revoked_at IS NOT NULL
            AND encrypted_access_token IS NULL
        )
    );

ALTER TABLE bank_connection_orphaned_items
    DROP COLUMN max_attempts,
    DROP COLUMN claim_expires_at,
    DROP COLUMN claimed_by,
    DROP COLUMN next_attempt_at,
    DROP COLUMN source_reason,
    DROP COLUMN dedupe_key;

CREATE INDEX idx_bank_connection_orphaned_items_open
    ON bank_connection_orphaned_items (retain_until, created_at)
    WHERE status IN ('pending_revocation', 'pending_reconciliation');

DROP TABLE IF EXISTS bank_connection_retention_selections;

ALTER TABLE bank_connections
    DROP CONSTRAINT bank_connections_status_valid;
UPDATE bank_connections
SET status = 'disconnected',
    encrypted_access_token = NULL,
    deleted_at = COALESCE(deleted_at, now())
WHERE status = 'revocation_pending';
ALTER TABLE bank_connections
    ADD CONSTRAINT bank_connections_status_valid CHECK (
        status IN ('active', 'needs_reauth', 'disconnected', 'error')
    );

-- Stage 6 permits NULL only on the orphan table; bank_connections originally
-- required a credential. Rows completed by #4405 are soft-deleted and cannot
-- satisfy that old shape, so the down migration intentionally keeps this
-- column nullable rather than inventing credential material.

CREATE OR REPLACE FUNCTION public.record_orphaned_bank_item(
    p_household_id UUID,
    p_owner_id UUID,
    p_provider TEXT,
    p_encrypted_access_token TEXT,
    p_last_error_code TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'pending_revocation',
    p_connection_id UUID DEFAULT NULL
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
    IF p_status IS NULL OR p_status NOT IN ('pending_revocation', 'pending_reconciliation') THEN
        RAISE EXCEPTION 'an orphan handoff must be recorded in an open status'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_encrypted_access_token IS NULL OR btrim(p_encrypted_access_token) = '' THEN
        RAISE EXCEPTION 'encrypted access token is required to retain revocation capability'
            USING ERRCODE = 'not_null_violation';
    END IF;

    INSERT INTO bank_connection_orphaned_items (
        household_id,
        owner_id,
        connection_id,
        provider,
        encrypted_access_token,
        status,
        attempts,
        last_error_code
    )
    VALUES (
        p_household_id,
        p_owner_id,
        p_connection_id,
        p_provider,
        p_encrypted_access_token,
        p_status,
        1,
        p_last_error_code
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_orphaned_bank_items(
    p_terminal_retention INTERVAL DEFAULT interval '90 days'
)
RETURNS TABLE (abandoned BIGINT, deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_abandoned BIGINT;
    v_deleted   BIGINT;
BEGIN
    WITH expired AS (
        UPDATE bank_connection_orphaned_items
        SET status = 'abandoned',
            encrypted_access_token = NULL,
            revoked_at = now(),
            last_error_code = COALESCE(last_error_code, 'RETENTION_EXPIRED')
        WHERE status IN ('pending_revocation', 'pending_reconciliation')
          AND retain_until <= now()
        RETURNING 1
    )
    SELECT count(*) INTO v_abandoned FROM expired;

    WITH purged AS (
        DELETE FROM bank_connection_orphaned_items
        WHERE status IN ('revoked', 'abandoned')
          AND revoked_at <= now() - COALESCE(p_terminal_retention, interval '90 days')
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM purged;

    RETURN QUERY SELECT v_abandoned, v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_orphaned_bank_item(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_orphaned_bank_item(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL)
    TO service_role;
