-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- DOWN: 20260908000002_durable_bank_revocation (#4405)
-- =============================================================================
-- Restores the Stage 6 schema and maintenance behavior. Provider credentials
-- already purged after a confirmed revoke cannot and must not be recreated.
-- Consequently, `bank_connections.encrypted_access_token` remains nullable for
-- already-disconnected rows; open Stage 7 jobs are moved back to the matching
-- live row before the Stage 7 columns are removed.
-- =============================================================================

DO $rollback_guard$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE status = 'processing'
    ) THEN
        RAISE EXCEPTION
            'cannot roll back durable bank revocation while worker leases are in flight';
    END IF;
END $rollback_guard$;

DO $cron$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (
            SELECT 1 FROM cron.job
            WHERE jobname = 'dispatch-bank-revocation-worker'
        ) THEN
            PERFORM cron.unschedule('dispatch-bank-revocation-worker');
        END IF;
        IF EXISTS (
            SELECT 1 FROM cron.job
            WHERE jobname = 'reconcile-bank-connection-downgrades'
        ) THEN
            PERFORM cron.unschedule('reconcile-bank-connection-downgrades');
        END IF;
    END IF;
END $cron$;

DROP TRIGGER IF EXISTS trg_current_household_entitlement_bank_downgrade
    ON current_household_entitlements;
DROP FUNCTION IF EXISTS public.enforce_bank_connection_allowance_reduction();

DROP FUNCTION IF EXISTS public.requeue_exhausted_bank_revocation_job(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.complete_bank_revocation_job(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.retry_bank_revocation_job(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.resolve_bank_revocation_reconciliation(UUID, UUID);
DROP FUNCTION IF EXISTS public.claim_bank_revocation_jobs(INTEGER, INTERVAL);
DROP FUNCTION IF EXISTS public.enqueue_bank_connection_erasure(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.finalize_or_enqueue_bank_connection(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID
);
DROP FUNCTION IF EXISTS public.prepare_bank_connection_retention_selection(
    UUID, UUID, BIGINT, UUID[]
);
DROP FUNCTION IF EXISTS public.transition_bank_connection_sync_state(
    UUID, TEXT, TEXT, TEXT
);

DROP TRIGGER IF EXISTS trg_bank_connection_reservation_erasure_barrier
    ON bank_connection_reservations;
DROP FUNCTION IF EXISTS public.enforce_bank_connection_erasure_barrier();
DROP TRIGGER IF EXISTS trg_bank_connection_erasure_barriers_updated_at
    ON bank_connection_erasure_barriers;
DROP TABLE IF EXISTS bank_connection_erasure_barriers;
DROP FUNCTION IF EXISTS public.bank_connection_owner_fingerprint(UUID);

DROP TRIGGER IF EXISTS trg_transactions_require_active_bank_connection
    ON transactions;
DROP FUNCTION IF EXISTS public.enforce_active_bank_connection_for_aggregator_write();

DROP TRIGGER IF EXISTS trg_bank_connection_retention_selections_updated_at
    ON bank_connection_retention_selections;
DROP TABLE IF EXISTS bank_connection_retention_selections;

DROP TRIGGER IF EXISTS trg_prepare_bank_revocation_outbox_row
    ON bank_connection_orphaned_items;
DROP FUNCTION IF EXISTS public.prepare_bank_revocation_outbox_row();

-- Restore credentials for live rows that have not reached a terminal provider
-- outcome. This is the only reversible representation of an in-flight Stage 7
-- operation once the outbox columns are removed.
UPDATE bank_connections c
SET encrypted_access_token = o.encrypted_access_token,
    status = 'error',
    error_code = 'REVOCATION_RETRY_ROLLED_BACK'
FROM bank_connection_orphaned_items o
WHERE o.connection_id = c.id
  AND c.status = 'revocation_pending'
  AND c.deleted_at IS NULL
  AND o.status IN (
      'pending_revocation',
      'pending_reconciliation',
      'retry_wait',
      'processing',
      'exhausted'
  )
  AND o.encrypted_access_token IS NOT NULL
  AND o.operation_reason IN ('downgrade', 'user_disconnect');

-- Rows restored to a live connection are no longer orphans in the Stage 6
-- model. Keep account-deletion jobs whose source row is already gone.
DELETE FROM bank_connection_orphaned_items o
USING bank_connections c
WHERE o.connection_id = c.id
  AND c.deleted_at IS NULL
  AND c.encrypted_access_token IS NOT NULL
  AND o.operation_reason IN ('downgrade', 'user_disconnect');

-- A reconciliation terminal means the credential was confirmed to exist on a
-- live bank_connections row, not that the provider was revoked. It has no
-- Stage 6 orphan equivalent and contains no credential, so remove only that
-- redundant handoff row.
DELETE FROM bank_connection_orphaned_items WHERE status = 'reconciled';

UPDATE bank_connection_orphaned_items
SET status = 'pending_revocation',
    claimed_at = NULL,
    claim_expires_at = NULL,
    claim_token = NULL,
    exhausted_at = NULL,
    reconciliation_required = false
WHERE status IN ('retry_wait', 'processing', 'exhausted');

-- Restore the non-idempotent Stage 6 recorder before removing the Stage 7 key.
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

CREATE OR REPLACE FUNCTION public.record_orphaned_bank_item_attempt(
    p_id UUID,
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
    UPDATE bank_connection_orphaned_items
    SET attempts = attempts + 1,
        last_error_code = COALESCE(p_last_error_code, last_error_code)
    WHERE id = p_id
      AND status IN ('pending_revocation', 'pending_reconciliation');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

DROP INDEX IF EXISTS idx_bank_connection_revocation_exhausted;
DROP INDEX IF EXISTS idx_bank_connection_revocation_claim;
DROP INDEX IF EXISTS idx_bank_connection_revocation_open_connection;
DROP INDEX IF EXISTS idx_bank_connection_revocation_idempotency;

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT IF EXISTS bank_connection_revocation_exhaustion_check,
    DROP CONSTRAINT IF EXISTS bank_connection_revocation_claim_check,
    DROP CONSTRAINT IF EXISTS bank_connection_revocation_attempt_limit,
    DROP CONSTRAINT IF EXISTS bank_connection_revocation_reason_valid,
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
    DROP COLUMN reconciliation_required,
    DROP COLUMN exhausted_at,
    DROP COLUMN max_completion_recovery_attempts,
    DROP COLUMN completion_recovery_attempts,
    DROP COLUMN max_attempts,
    DROP COLUMN last_attempt_at,
    DROP COLUMN claim_token,
    DROP COLUMN claim_expires_at,
    DROP COLUMN claimed_at,
    DROP COLUMN available_at,
    DROP COLUMN idempotency_key,
    DROP COLUMN operation_reason;

COMMENT ON TABLE bank_connection_orphaned_items IS
    'Server-only durable handoff (#4404) for a provider Item that became '
    'billable but could not be finalized, or whose finalization outcome could '
    'not be confirmed. Retains the encrypted credential ONLY while an open '
    'status makes revocation or reconciliation possible, and only until '
    'retain_until. Terminal rows hold no credential. Never client-readable and '
    'never synced.';

ALTER TABLE bank_connections
    DROP CONSTRAINT IF EXISTS bank_connections_revocation_pending_check,
    DROP CONSTRAINT IF EXISTS bank_connections_live_credential_check,
    DROP CONSTRAINT IF EXISTS bank_connections_status_valid,
    DROP COLUMN sync_disabled_at;

UPDATE bank_connections
SET status = CASE
        WHEN deleted_at IS NULL THEN 'error'
        ELSE 'disconnected'
    END
WHERE status = 'revocation_pending'
  AND encrypted_access_token IS NOT NULL;

UPDATE bank_connections
SET status = 'disconnected',
    deleted_at = COALESCE(deleted_at, now())
WHERE status = 'revocation_pending'
  AND encrypted_access_token IS NULL;

ALTER TABLE bank_connections
    ADD CONSTRAINT bank_connections_status_valid
        CHECK (status IN ('active', 'needs_reauth', 'disconnected', 'error'));

-- Restore the Stage 6 retention function.
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

COMMENT ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL) IS
    'Bounded-retention backstop for the orphan handoff table (#4404). '
    'Force-abandons open rows past retain_until, destroying the encrypted '
    'credential, and deletes credential-free terminal rows once their '
    'disposition is older than the terminal retention window.';

-- Restore the Stage 6 maintenance output and call graph.
CREATE OR REPLACE FUNCTION public.run_all_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate_limits INTEGER;
    v_webauthn INTEGER;
    v_sync_logs INTEGER;
    v_invitations INTEGER;
    v_audit_logs INTEGER;
    v_bank_orphans RECORD;
    v_analyze_result TEXT;
BEGIN
    v_rate_limits := cleanup_expired_rate_limits();
    v_webauthn := cleanup_expired_webauthn_challenges();
    v_sync_logs := cleanup_old_sync_health_logs();
    v_invitations := cleanup_expired_invitations();
    v_audit_logs := cleanup_old_audit_logs(retention_days => 90);
    SELECT * INTO v_bank_orphans FROM purge_expired_orphaned_bank_items();
    v_analyze_result := vacuum_analyze_tables();

    RETURN jsonb_build_object(
        'rate_limits_deleted', v_rate_limits,
        'webauthn_challenges_deleted', v_webauthn,
        'sync_health_logs_deleted', v_sync_logs,
        'invitations_expired', v_invitations,
        'audit_logs_deleted', v_audit_logs,
        'bank_orphans_abandoned', v_bank_orphans.abandoned,
        'bank_orphans_deleted', v_bank_orphans.deleted,
        'analyze_result', v_analyze_result,
        'completed_at', now()
    );
END;
$$;

DROP FUNCTION IF EXISTS public.bank_revocation_reconciliation_summary();
DROP FUNCTION IF EXISTS public.dispatch_bank_revocation_worker();
DROP FUNCTION IF EXISTS public.reconcile_bank_connection_allowances(INTEGER);
DROP FUNCTION IF EXISTS public.apply_bank_connection_allowance_reduction(
    UUID, BIGINT, BIGINT, BIGINT
);
DROP FUNCTION IF EXISTS public.enqueue_bank_connection_revocation(UUID, TEXT, UUID, BOOLEAN);

GRANT EXECUTE ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL)
    TO service_role;
REVOKE EXECUTE ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance()
    FROM PUBLIC, anon, authenticated;
