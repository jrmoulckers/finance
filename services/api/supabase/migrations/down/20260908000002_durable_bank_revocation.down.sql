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
           OR provider_work_started_at IS NOT NULL
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
DROP TRIGGER IF EXISTS trg_protect_bank_connection_revocation_state ON bank_connections;
DROP FUNCTION IF EXISTS public.protect_bank_connection_revocation_state();

-- Restore Stage 6 cap semantics before reactivating pending connections. This
-- makes the existing trigger treat them as already-consuming rows during the
-- status restoration rather than rejecting the pre-downgrade over-cap set.
CREATE OR REPLACE FUNCTION public.bank_connection_consumes_cap(
    p_status TEXT,
    p_deleted_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT p_deleted_at IS NULL;
$$;

DROP TRIGGER IF EXISTS trg_bank_connection_retention_selections_updated_at
    ON bank_connection_retention_selections;
DROP TABLE IF EXISTS bank_connection_retention_selections;

-- Allow the Stage 6 credential shape while pending and legacy credentials are
-- restored. The Stage 6 NOT NULL/status constraints are installed below.
ALTER TABLE bank_connections
    DROP CONSTRAINT bank_connections_credential_state_check;

-- Restore pending Stage 7 connection credentials before deleting their outbox
-- records. The guard above guarantees none has completed externally.
UPDATE bank_connections c
SET encrypted_access_token = o.encrypted_access_token,
    status = COALESCE(o.connection_previous_status, 'active'),
    revocation_enqueued_at = NULL
FROM bank_connection_orphaned_items o
WHERE o.connection_id = c.id
  AND o.connection_previous_status IS NOT NULL
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
WHERE connection_previous_status IS NOT NULL
   OR reason IN ('user_disconnect', 'entitlement_downgrade');

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
    DROP CONSTRAINT bank_connection_orphaned_items_previous_status_valid,
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
    DROP COLUMN provider_work_started_at,
    DROP COLUMN lease_expires_at,
    DROP COLUMN lease_token,
    DROP COLUMN next_attempt_at,
    DROP COLUMN connection_previous_status,
    DROP COLUMN reason;

CREATE INDEX idx_bank_connection_orphaned_items_open
    ON bank_connection_orphaned_items (retain_until, created_at)
    WHERE status IN ('pending_revocation', 'pending_reconciliation');

ALTER TABLE bank_connections
    DROP CONSTRAINT bank_connections_status_valid,
    ADD CONSTRAINT bank_connections_status_valid CHECK (
        status IN ('active', 'needs_reauth', 'disconnected', 'error')
    ),
    ALTER COLUMN encrypted_access_token SET NOT NULL,
    DROP COLUMN revocation_enqueued_at;

-- Restore the Stage 6 finalizer and handoff recorder without the Stage 7
-- connection-id tombstone protocol.
CREATE OR REPLACE FUNCTION public.finalize_bank_connection_reservation(
    p_reservation_id UUID,
    p_household_id UUID,
    p_owner_id UUID,
    p_provider TEXT,
    p_institution_id TEXT,
    p_institution_name TEXT,
    p_encrypted_access_token TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_connection_id UUID DEFAULT NULL
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
    v_existing    bank_connections%ROWTYPE;
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

    IF p_connection_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM bank_connections
        WHERE id = p_connection_id AND household_id = p_household_id;

        IF FOUND THEN
            IF v_existing.deleted_at IS NULL THEN
                RETURN QUERY SELECT 'finalized'::TEXT, v_existing.id, v_existing.created_at;
            ELSE
                RETURN QUERY SELECT
                    'already_disconnected'::TEXT,
                    NULL::UUID,
                    NULL::TIMESTAMPTZ;
            END IF;
            RETURN;
        END IF;
    END IF;

    DELETE FROM bank_connection_reservations
    WHERE household_id = p_household_id
      AND expires_at <= now()
      AND id <> p_reservation_id;

    SELECT * INTO v_reservation
    FROM bank_connection_reservations
    WHERE id = p_reservation_id AND household_id = p_household_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            'reservation_not_found'::TEXT,
            NULL::UUID,
            NULL::TIMESTAMPTZ;
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
        id,
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
        COALESCE(p_connection_id, gen_random_uuid()),
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

-- Restore the Stage 6 direct mutators removed by the leased Stage 7 worker.
CREATE FUNCTION public.complete_orphaned_bank_item(
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

CREATE FUNCTION public.record_orphaned_bank_item_attempt(
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

CREATE FUNCTION public.claim_orphaned_bank_items_for_erasure(
    p_owner_id UUID,
    p_household_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
    id                     UUID,
    provider               TEXT,
    encrypted_access_token TEXT,
    status                 TEXT,
    connection_id          UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE bank_connection_orphaned_items o
    SET erasure_requested_at = COALESCE(o.erasure_requested_at, now()),
        retain_until = LEAST(o.retain_until, now() + interval '7 days')
    WHERE o.status IN ('pending_revocation', 'pending_reconciliation')
      AND (
          (p_owner_id IS NOT NULL AND o.owner_id = p_owner_id)
          OR (p_household_ids IS NOT NULL AND o.household_id = ANY (p_household_ids))
      )
    RETURNING o.id, o.provider, o.encrypted_access_token, o.status, o.connection_id;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_orphaned_bank_item(UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_orphaned_bank_item(UUID, TEXT, TEXT)
    TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_orphaned_bank_item_attempt(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_orphaned_bank_item_attempt(UUID, TEXT)
    TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_orphaned_bank_items_for_erasure(UUID, UUID[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_orphaned_bank_items_for_erasure(UUID, UUID[])
    TO service_role;
