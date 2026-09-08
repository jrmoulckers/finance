-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- DOWN Migration: 20260908000002_durable_bank_revocation (#4405)
-- =============================================================================
-- Provider revocation is externally irreversible. Rollback is therefore
-- refused after Stage 7 account-erasure handoff or terminal provider work.
-- Pending disconnect/downgrade rows are restored to live connections before
-- the Stage 7 columns are removed.
-- =============================================================================

DO $rollback_guard$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE reason = 'account_deletion'
           OR (
               reason IN ('user_disconnect', 'entitlement_downgrade')
               AND status IN ('revoked', 'reconciled', 'abandoned')
           )
    ) THEN
        RAISE EXCEPTION
            'cannot reverse durable bank revocation after identity severance or terminal provider work';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM bank_connections c
        WHERE c.encrypted_access_token IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM bank_connection_orphaned_items o
              WHERE o.connection_id = c.id
                AND o.status IN (
                    'pending_revocation',
                    'pending_reconciliation',
                    'processing',
                    'retry_wait',
                    'exhausted'
                )
                AND o.encrypted_access_token IS NOT NULL
          )
    ) THEN
        RAISE EXCEPTION
            'cannot reverse durable bank revocation after a connection credential was terminally purged';
    END IF;
END
$rollback_guard$;

DROP TRIGGER IF EXISTS trg_enforce_bank_allowance_after_projection
    ON current_household_entitlements;
DROP FUNCTION IF EXISTS public.enforce_bank_connection_allowance_after_projection();
DROP FUNCTION IF EXISTS public.bank_revocation_reconciliation_summary();
DROP FUNCTION IF EXISTS public.recover_exhausted_bank_revocations(INTEGER);
DROP FUNCTION IF EXISTS public.record_bank_revocation_result(UUID, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.claim_bank_revocation_jobs(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.enforce_due_bank_connection_downgrades(INTEGER);
DROP FUNCTION IF EXISTS public.enforce_bank_connection_allowance_internal(UUID);
DROP FUNCTION IF EXISTS public.save_bank_connection_retention_selection(UUID, UUID, UUID[]);
DROP FUNCTION IF EXISTS public.request_bank_connection_revocation(UUID, UUID);
DROP FUNCTION IF EXISTS public.sever_bank_revocation_identities_for_account(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.enqueue_bank_connection_revocation_internal(UUID, TEXT, BOOLEAN);

DROP TRIGGER IF EXISTS trg_bank_connection_retention_selections_updated_at
    ON bank_connection_retention_selections;
DROP TABLE IF EXISTS bank_connection_retention_selections;

-- Restore pending Stage 7 connection credentials before deleting their outbox
-- records. The guard above guarantees none has completed externally.
UPDATE bank_connections c
SET encrypted_access_token = o.encrypted_access_token,
    status = 'active'
FROM bank_connection_orphaned_items o
WHERE o.connection_id = c.id
  AND o.reason IN ('user_disconnect', 'entitlement_downgrade')
  AND o.status IN ('pending_revocation', 'processing', 'retry_wait', 'exhausted')
  AND o.encrypted_access_token IS NOT NULL
  AND c.status = 'revocation_pending';

-- Up migration reconciles legacy disconnected rows by moving their lingering
-- credential into the outbox. Restore those rows if no Stage 7 provider work
-- has completed; the guard above rejects the irreversible terminal case.
UPDATE bank_connections c
SET encrypted_access_token = o.encrypted_access_token
FROM bank_connection_orphaned_items o
WHERE o.connection_id = c.id
  AND c.status = 'disconnected'
  AND c.encrypted_access_token IS NULL
  AND o.status IN (
      'pending_revocation',
      'pending_reconciliation',
      'processing',
      'retry_wait',
      'exhausted'
  )
  AND o.encrypted_access_token IS NOT NULL;

DELETE FROM bank_connection_orphaned_items
WHERE reason IN ('user_disconnect', 'entitlement_downgrade');

UPDATE bank_connection_orphaned_items
SET status = 'pending_revocation',
    lease_token = NULL,
    lease_expires_at = NULL
WHERE status IN ('processing', 'retry_wait', 'exhausted');

UPDATE bank_connection_orphaned_items
SET status = 'revoked'
WHERE status = 'reconciled';

DROP INDEX IF EXISTS idx_bank_connection_reconciliation_ready;
DROP INDEX IF EXISTS idx_bank_connection_revocation_exhausted;
DROP INDEX IF EXISTS idx_bank_connection_revocation_lease;
DROP INDEX IF EXISTS idx_bank_connection_revocation_ready;

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT bank_connection_orphaned_items_terminal_check,
    DROP CONSTRAINT bank_connection_orphaned_items_lease_check,
    DROP CONSTRAINT bank_connection_orphaned_items_error_code_safe,
    DROP CONSTRAINT bank_connection_orphaned_items_attempt_bounds,
    DROP CONSTRAINT bank_connection_orphaned_items_reason_valid,
    DROP CONSTRAINT bank_connection_orphaned_items_status_valid,
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
    ),
    DROP COLUMN recovery_attempts,
    DROP COLUMN max_attempts,
    DROP COLUMN lease_expires_at,
    DROP COLUMN lease_token,
    DROP COLUMN next_attempt_at,
    DROP COLUMN reason;

CREATE INDEX idx_bank_connection_orphaned_items_open
    ON bank_connection_orphaned_items (retain_until, created_at)
    WHERE status IN ('pending_revocation', 'pending_reconciliation');

ALTER TABLE bank_connections
    DROP CONSTRAINT bank_connections_credential_state_check,
    DROP CONSTRAINT bank_connections_status_valid,
    ADD CONSTRAINT bank_connections_status_valid CHECK (
        status IN ('active', 'needs_reauth', 'disconnected', 'error')
    ),
    ALTER COLUMN encrypted_access_token SET NOT NULL;

-- Restore the Stage 6 retention implementation.
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
          AND revoked_at <= now() - COALESCE(p_terminal_retention, interval '90 days')
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM purged;

    RETURN QUERY SELECT v_abandoned, v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL)
    TO service_role;
