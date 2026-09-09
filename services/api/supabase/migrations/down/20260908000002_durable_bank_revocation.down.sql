-- SPDX-License-Identifier: BUSL-1.1

-- Down migration for 20260908000002_durable_bank_revocation.
-- Intended only for an unshipped/local schema.

DROP TRIGGER IF EXISTS trg_current_household_entitlements_bank_cap_reduction
    ON current_household_entitlements;

DROP FUNCTION IF EXISTS public.bank_connection_revocation_status();
DROP FUNCTION IF EXISTS public.fail_bank_connection_revocation(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.complete_bank_connection_revocation(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.claim_bank_connection_revocations(INTEGER, INTERVAL);
DROP FUNCTION IF EXISTS public.prepare_bank_connection_erasure(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.apply_bank_connection_cap_reduction_internal();
DROP FUNCTION IF EXISTS public.prepare_bank_connection_downgrade(UUID, UUID, TEXT, UUID[]);
DROP FUNCTION IF EXISTS public.enqueue_bank_connection_revocation(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.enqueue_bank_connection_revocation_internal(UUID, TEXT, UUID);

DROP TABLE IF EXISTS bank_connection_retention_selections;

-- Restore connection-backed credentials before removing the worker state.
UPDATE bank_connections c
SET encrypted_access_token = o.encrypted_access_token,
    status = 'active',
    deleted_at = NULL,
    sync_enabled = true,
    sync_disabled_at = NULL
FROM bank_connection_orphaned_items o
WHERE o.connection_id = c.id
  AND o.operation IN ('downgrade', 'user_disconnect', 'account_deletion')
  AND o.encrypted_access_token IS NOT NULL;

DELETE FROM bank_connection_orphaned_items
WHERE operation IN ('downgrade', 'user_disconnect', 'account_deletion');

UPDATE bank_connection_orphaned_items
SET status = CASE
        WHEN status IN ('revoked', 'already_invalid', 'retained') THEN 'revoked'
        WHEN status = 'abandoned' THEN 'abandoned'
        ELSE 'pending_revocation'
    END,
    encrypted_access_token = CASE
        WHEN status IN ('revoked', 'already_invalid', 'retained', 'abandoned')
        THEN NULL
        ELSE encrypted_access_token
    END,
    revoked_at = CASE
        WHEN status IN ('revoked', 'already_invalid', 'retained', 'abandoned')
        THEN COALESCE(revoked_at, now())
        ELSE NULL
    END;

DROP INDEX IF EXISTS idx_bank_connection_revocations_alert;
DROP INDEX IF EXISTS idx_bank_connection_revocations_claim_expiry;
DROP INDEX IF EXISTS idx_bank_connection_revocations_reconcile;
DROP INDEX IF EXISTS idx_bank_connection_revocations_due;
DROP INDEX IF EXISTS idx_bank_connection_revocations_idempotency;

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT IF EXISTS bank_connection_revocations_claim_check,
    DROP CONSTRAINT IF EXISTS bank_connection_revocations_error_code_check,
    DROP CONSTRAINT IF EXISTS bank_connection_revocations_attempt_bound_check,
    DROP CONSTRAINT IF EXISTS bank_connection_revocations_idempotency_check,
    DROP CONSTRAINT IF EXISTS bank_connection_revocations_operation_check,
    DROP CONSTRAINT IF EXISTS bank_connection_orphaned_items_terminal_check,
    DROP CONSTRAINT IF EXISTS bank_connection_orphaned_items_status_valid;

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
    DROP COLUMN completed_at,
    DROP COLUMN max_attempts,
    DROP COLUMN claim_expires_at,
    DROP COLUMN claim_token,
    DROP COLUMN last_attempt_at,
    DROP COLUMN next_attempt_at,
    DROP COLUMN idempotency_key,
    DROP COLUMN operation;

CREATE OR REPLACE FUNCTION public.complete_orphaned_bank_item(
    p_id UUID,
    p_status TEXT,
    p_last_error_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    IF p_status IS NULL OR p_status NOT IN ('revoked', 'abandoned') THEN
        RAISE EXCEPTION 'terminal status must be revoked or abandoned'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE bank_connection_orphaned_items
    SET status = p_status,
        encrypted_access_token = NULL,
        revoked_at = now(),
        attempts = attempts + 1,
        last_error_code = COALESCE(p_last_error_code, last_error_code)
    WHERE id = p_id
      AND status IN ('pending_revocation', 'pending_reconciliation');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
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
    v_deleted BIGINT;
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
          AND revoked_at <= now() - COALESCE(
              p_terminal_retention,
              interval '90 days'
          )
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM purged;

    RETURN QUERY SELECT v_abandoned, v_deleted;
END;
$$;

DROP INDEX IF EXISTS idx_bank_connections_sync_eligible;
ALTER TABLE bank_connections
    DROP CONSTRAINT bank_connections_revocation_state_check,
    DROP CONSTRAINT bank_connections_status_valid;
ALTER TABLE bank_connections
    ADD CONSTRAINT bank_connections_status_valid CHECK (
        status IN ('active', 'needs_reauth', 'disconnected', 'error')
    );
ALTER TABLE bank_connections
    DROP COLUMN sync_disabled_at,
    DROP COLUMN sync_enabled,
    ALTER COLUMN encrypted_access_token SET NOT NULL;

GRANT INSERT, UPDATE, DELETE ON TABLE bank_connections TO authenticated, anon;
