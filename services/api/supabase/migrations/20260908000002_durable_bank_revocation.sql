-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Migration: 20260908000002_durable_bank_revocation
-- Description: Durable downgrade and provider revocation workflow (#4405)
-- =============================================================================
-- Evolves the Stage 6 orphan handoff into the one encrypted, server-only
-- revocation outbox. A connection is disabled first by moving its encrypted
-- credential into this table and setting `bank_connections.status` to
-- `revocation_pending` in the same transaction. Historical accounts and
-- transactions are never deleted by this workflow.
--
-- Provider calls happen only in the Edge worker. Database claims use
-- FOR UPDATE SKIP LOCKED, a bounded lease, bounded exponential backoff with
-- jitter, and a bounded exhausted-state recovery budget.
-- =============================================================================

-- A pending connection remains visible to clients as status-only history, but
-- can no longer synchronize because its credential has moved server-side.
ALTER TABLE bank_connections
    ALTER COLUMN encrypted_access_token DROP NOT NULL,
    DROP CONSTRAINT bank_connections_status_valid,
    ADD CONSTRAINT bank_connections_status_valid CHECK (
        status IN ('active', 'needs_reauth', 'revocation_pending', 'disconnected', 'error')
    ),
    ADD CONSTRAINT bank_connections_credential_state_check CHECK (
        (
            status IN ('active', 'needs_reauth', 'error')
            AND deleted_at IS NULL
            AND encrypted_access_token IS NOT NULL
        )
        OR (
            status = 'revocation_pending'
            AND deleted_at IS NULL
            AND encrypted_access_token IS NULL
        )
        OR (
            status = 'disconnected'
            AND encrypted_access_token IS NULL
        )
    ) NOT VALID;

-- Existing rows predate the state constraint. A disconnected row that still
-- holds a token must be handed off before the connection copy is cleared.
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
SELECT
    c.household_id,
    c.owner_id,
    c.id,
    c.provider,
    c.encrypted_access_token,
    'pending_revocation',
    0,
    'LEGACY_DISCONNECT_RECONCILIATION'
FROM bank_connections c
WHERE c.status = 'disconnected'
  AND c.encrypted_access_token IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM bank_connection_orphaned_items o
      WHERE o.connection_id = c.id
        AND o.status IN ('pending_revocation', 'pending_reconciliation')
  );

UPDATE bank_connections
SET encrypted_access_token = NULL
WHERE status = 'disconnected';
ALTER TABLE bank_connections VALIDATE CONSTRAINT bank_connections_credential_state_check;

COMMENT ON COLUMN bank_connections.status IS
    'active/needs_reauth/error may synchronize; revocation_pending is disabled '
    'immediately while the server-only outbox retries provider erasure; '
    'disconnected is terminal after provider revoked/already-invalid.';

-- The Stage 6 table is deliberately retained rather than creating a second
-- queue. These columns turn it into the unified revocation state machine.
ALTER TABLE bank_connection_orphaned_items
    ADD COLUMN reason TEXT NOT NULL DEFAULT 'finalization_failure',
    ADD COLUMN next_attempt_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN lease_token UUID,
    ADD COLUMN lease_expires_at TIMESTAMPTZ,
    ADD COLUMN max_attempts SMALLINT NOT NULL DEFAULT 8,
    ADD COLUMN recovery_attempts SMALLINT NOT NULL DEFAULT 0,
    DROP CONSTRAINT bank_connection_orphaned_items_status_valid,
    DROP CONSTRAINT bank_connection_orphaned_items_terminal_check,
    ADD CONSTRAINT bank_connection_orphaned_items_status_valid CHECK (
        status IN (
            'pending_revocation',
            'pending_reconciliation',
            'processing',
            'retry_wait',
            'exhausted',
            'revoked',
            'reconciled',
            'abandoned'
        )
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_reason_valid CHECK (
        reason IN (
            'finalization_failure',
            'user_disconnect',
            'entitlement_downgrade',
            'account_deletion'
        )
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_attempt_bounds CHECK (
        attempts >= 0
        AND max_attempts BETWEEN 1 AND 12
        AND recovery_attempts BETWEEN 0 AND 2
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_error_code_safe CHECK (
        last_error_code IS NULL OR length(last_error_code) <= 128
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_lease_check CHECK (
        (
            status = 'processing'
            AND lease_token IS NOT NULL
            AND lease_expires_at IS NOT NULL
        )
        OR (
            status <> 'processing'
            AND lease_token IS NULL
            AND lease_expires_at IS NULL
        )
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_terminal_check CHECK (
        (
            status IN (
                'pending_revocation',
                'pending_reconciliation',
                'processing',
                'retry_wait',
                'exhausted'
            )
            AND revoked_at IS NULL
            AND encrypted_access_token IS NOT NULL
        )
        OR (
            status IN ('revoked', 'reconciled', 'abandoned')
            AND revoked_at IS NOT NULL
            AND encrypted_access_token IS NULL
        )
    );

UPDATE bank_connection_orphaned_items
SET reason = 'user_disconnect'
WHERE last_error_code = 'LEGACY_DISCONNECT_RECONCILIATION'
  AND reason = 'finalization_failure';

DROP INDEX IF EXISTS idx_bank_connection_orphaned_items_open;
CREATE INDEX idx_bank_connection_revocation_ready
    ON bank_connection_orphaned_items (next_attempt_at, created_at, id)
    WHERE status IN ('pending_revocation', 'retry_wait');
CREATE INDEX idx_bank_connection_revocation_lease
    ON bank_connection_orphaned_items (lease_expires_at)
    WHERE status = 'processing';
CREATE INDEX idx_bank_connection_revocation_exhausted
    ON bank_connection_orphaned_items (retain_until, created_at, id)
    WHERE status = 'exhausted';
CREATE INDEX idx_bank_connection_reconciliation_ready
    ON bank_connection_orphaned_items (created_at, id)
    WHERE status = 'pending_reconciliation';

COMMENT ON TABLE bank_connection_orphaned_items IS
    'Single minimized encrypted bank-revocation outbox (#4405), evolved from '
    'the Stage 6 orphan handoff. Stores only provider, encrypted credential, '
    'safe state/error metadata, and temporary ownership linkage. RLS-protected, '
    'service-role only, excluded from APIs, export, logs, telemetry, and '
    'PowerSync. Terminal rows never retain a credential.';

-- A selection is non-credential state, kept server-only and bound to the
-- server-resolved projection subject that was current when it was submitted.
CREATE TABLE bank_connection_retention_selections (
    household_id             UUID PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
    entitlement_grant_id     UUID NOT NULL REFERENCES entitlement_grants(id) ON DELETE CASCADE,
    entitlement_expires_at   TIMESTAMPTZ NOT NULL,
    projection_version       BIGINT NOT NULL,
    retained_connection_ids  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    selected_by              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_at               TIMESTAMPTZ,
    application              TEXT,

    CONSTRAINT bank_connection_retention_projection_check CHECK (projection_version > 0),
    CONSTRAINT bank_connection_retention_application_check CHECK (
        application IS NULL OR application IN ('explicit', 'fallback')
    ),
    CONSTRAINT bank_connection_retention_applied_check CHECK (
        (applied_at IS NULL AND application IS NULL)
        OR (applied_at IS NOT NULL AND application IS NOT NULL)
    )
);

CREATE TRIGGER trg_bank_connection_retention_selections_updated_at
    BEFORE UPDATE ON bank_connection_retention_selections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE bank_connection_retention_selections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bank_connection_retention_selections
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_connection_retention_selections
    TO service_role;

COMMENT ON TABLE bank_connection_retention_selections IS
    'Server-only authenticated retention choice for a scheduled allowance '
    'reduction (#4405). Contains connection UUIDs only, never provider '
    'identifiers, credentials, account data, or financial data.';

-- -----------------------------------------------------------------------------
-- Transactional enqueue-before-disable
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.enqueue_bank_connection_revocation_internal(
    p_connection_id UUID,
    p_reason TEXT,
    p_detach_identity BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_connection bank_connections%ROWTYPE;
    v_existing UUID;
    v_outbox_id UUID;
BEGIN
    IF p_reason NOT IN ('user_disconnect', 'entitlement_downgrade', 'account_deletion') THEN
        RAISE EXCEPTION 'invalid revocation reason' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_connection
    FROM bank_connections
    WHERE id = p_connection_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT id INTO v_existing
    FROM bank_connection_orphaned_items
    WHERE connection_id = p_connection_id
      AND status IN (
          'pending_revocation',
          'pending_reconciliation',
          'processing',
          'retry_wait',
          'exhausted'
      )
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        UPDATE bank_connection_orphaned_items
        SET status = CASE
                WHEN status = 'pending_reconciliation' THEN 'pending_revocation'
                ELSE status
            END,
            reason = CASE
                WHEN p_reason = 'account_deletion' THEN 'account_deletion'
                ELSE reason
            END,
            erasure_requested_at = CASE
                WHEN p_reason = 'account_deletion'
                THEN COALESCE(erasure_requested_at, now())
                ELSE erasure_requested_at
            END,
            retain_until = CASE
                WHEN p_reason = 'account_deletion'
                THEN LEAST(retain_until, now() + interval '7 days')
                ELSE retain_until
            END,
            owner_id = CASE WHEN p_detach_identity THEN NULL ELSE owner_id END,
            household_id = CASE WHEN p_detach_identity THEN NULL ELSE household_id END,
            connection_id = CASE WHEN p_detach_identity THEN NULL ELSE connection_id END
        WHERE id = v_existing;

        UPDATE bank_connections
        SET status = 'revocation_pending',
            encrypted_access_token = NULL,
            error_code = NULL,
            error_message = NULL
        WHERE id = v_connection.id
          AND deleted_at IS NULL
          AND status <> 'disconnected';
        RETURN v_existing;
    END IF;

    IF v_connection.deleted_at IS NOT NULL OR v_connection.status = 'disconnected' THEN
        RETURN NULL;
    END IF;
    IF v_connection.encrypted_access_token IS NULL THEN
        RAISE EXCEPTION 'revocation capability is unavailable'
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
        reason,
        next_attempt_at,
        erasure_requested_at,
        retain_until
    )
    VALUES (
        CASE WHEN p_detach_identity THEN NULL ELSE v_connection.household_id END,
        CASE WHEN p_detach_identity THEN NULL ELSE v_connection.owner_id END,
        CASE WHEN p_detach_identity THEN NULL ELSE v_connection.id END,
        v_connection.provider,
        v_connection.encrypted_access_token,
        'pending_revocation',
        0,
        p_reason,
        now(),
        CASE WHEN p_reason = 'account_deletion' THEN now() ELSE NULL END,
        CASE
            WHEN p_reason = 'account_deletion' THEN now() + interval '7 days'
            ELSE now() + interval '30 days'
        END
    )
    RETURNING id INTO v_outbox_id;

    UPDATE bank_connections
    SET status = 'revocation_pending',
        encrypted_access_token = NULL,
        error_code = NULL,
        error_message = NULL
    WHERE id = v_connection.id;

    RETURN v_outbox_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_bank_connection_revocation_internal(UUID, TEXT, BOOLEAN) IS
    'Internal transactional move (#4405): inserts the encrypted credential into '
    'the single server-only outbox before clearing it from bank_connections and '
    'setting revocation_pending. Optional identity detachment is used only by '
    'account deletion after the durable row exists.';

CREATE FUNCTION public.request_bank_connection_revocation(
    p_connection_id UUID,
    p_actor_user_id UUID
)
RETURNS TABLE (status TEXT, outbox_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID;
    v_outbox_id UUID;
BEGIN
    SELECT household_id INTO v_household_id
    FROM bank_connections
    WHERE id = p_connection_id
      AND deleted_at IS NULL;

    IF v_household_id IS NULL THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM household_members
        WHERE household_id = v_household_id
          AND user_id = p_actor_user_id
          AND role IN ('owner', 'admin')
          AND deleted_at IS NULL
    ) THEN
        RETURN QUERY SELECT 'forbidden'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(v_household_id));
    v_outbox_id := enqueue_bank_connection_revocation_internal(
        p_connection_id,
        'user_disconnect',
        false
    );

    RETURN QUERY SELECT
        CASE WHEN v_outbox_id IS NULL THEN 'not_found' ELSE 'queued' END,
        v_outbox_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Authenticated retained selection and deterministic fallback
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.save_bank_connection_retention_selection(
    p_household_id UUID,
    p_actor_user_id UUID,
    p_retained_connection_ids UUID[]
)
RETURNS TABLE (
    status TEXT,
    effective_at TIMESTAMPTZ,
    selected_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_projection current_household_entitlements%ROWTYPE;
    v_ids UUID[] := COALESCE(p_retained_connection_ids, ARRAY[]::UUID[]);
    v_distinct_count BIGINT;
    v_live_count BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM household_members
        WHERE household_id = p_household_id
          AND user_id = p_actor_user_id
          AND role IN ('owner', 'admin')
          AND deleted_at IS NULL
    ) THEN
        RETURN QUERY SELECT 'forbidden'::TEXT, NULL::TIMESTAMPTZ, 0::BIGINT;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    SELECT * INTO v_projection
    FROM current_household_entitlements
    WHERE household_id = p_household_id
      AND source_base_grant_id IS NOT NULL
      AND expires_at > now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_scheduled'::TEXT, NULL::TIMESTAMPTZ, 0::BIGINT;
        RETURN;
    END IF;

    SELECT count(DISTINCT id) INTO v_distinct_count FROM unnest(v_ids) AS ids(id);
    IF v_distinct_count <> cardinality(v_ids) THEN
        RETURN QUERY SELECT 'invalid_selection'::TEXT, v_projection.expires_at, 0::BIGINT;
        RETURN;
    END IF;

    SELECT count(*) INTO v_live_count
    FROM bank_connections c
    WHERE c.household_id = p_household_id
      AND c.id = ANY(v_ids)
      AND c.deleted_at IS NULL
      AND c.status IN ('active', 'needs_reauth', 'error');

    IF v_live_count <> cardinality(v_ids) THEN
        RETURN QUERY SELECT 'invalid_selection'::TEXT, v_projection.expires_at, 0::BIGINT;
        RETURN;
    END IF;

    INSERT INTO bank_connection_retention_selections (
        household_id,
        entitlement_grant_id,
        entitlement_expires_at,
        projection_version,
        retained_connection_ids,
        selected_by
    )
    VALUES (
        p_household_id,
        v_projection.source_base_grant_id,
        v_projection.expires_at,
        v_projection.projection_version,
        v_ids,
        p_actor_user_id
    )
    ON CONFLICT (household_id) DO UPDATE
    SET entitlement_grant_id = EXCLUDED.entitlement_grant_id,
        entitlement_expires_at = EXCLUDED.entitlement_expires_at,
        projection_version = EXCLUDED.projection_version,
        retained_connection_ids = EXCLUDED.retained_connection_ids,
        selected_by = EXCLUDED.selected_by,
        applied_at = NULL,
        application = NULL;

    RETURN QUERY SELECT 'saved'::TEXT, v_projection.expires_at, cardinality(v_ids)::BIGINT;
END;
$$;

CREATE FUNCTION public.enforce_bank_connection_allowance_internal(p_household_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cap BIGINT;
    v_live BIGINT;
    v_projection current_household_entitlements%ROWTYPE;
    v_selection bank_connection_retention_selections%ROWTYPE;
    v_selection_found BOOLEAN := false;
    v_selection_valid BOOLEAN := false;
    v_connection_id UUID;
    v_queued BIGINT := 0;
BEGIN
    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));
    v_cap := bank_connection_cap_for_household(p_household_id);

    SELECT * INTO v_projection
    FROM current_household_entitlements
    WHERE household_id = p_household_id;

    SELECT count(*) INTO v_live
    FROM bank_connections
    WHERE household_id = p_household_id
      AND deleted_at IS NULL
      AND status IN ('active', 'needs_reauth', 'error');

    IF v_live <= v_cap THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_selection
    FROM bank_connection_retention_selections
    WHERE household_id = p_household_id
      AND applied_at IS NULL
      AND entitlement_expires_at <= now()
    FOR UPDATE;

    v_selection_found := FOUND;
    IF v_selection_found
       AND v_projection.household_id IS NOT NULL
       AND (
           (
               v_projection.projection_version = v_selection.projection_version
               AND v_projection.source_base_grant_id IS NOT DISTINCT FROM
                   v_selection.entitlement_grant_id
               AND v_projection.expires_at IS NOT DISTINCT FROM
                   v_selection.entitlement_expires_at
           )
           OR v_projection.projection_version = v_selection.projection_version + 1
       )
       AND cardinality(v_selection.retained_connection_ids) <= v_cap
       AND NOT EXISTS (
           SELECT 1
           FROM unnest(v_selection.retained_connection_ids) selected(id)
           WHERE NOT EXISTS (
               SELECT 1
               FROM bank_connections c
               WHERE c.id = selected.id
                 AND c.household_id = p_household_id
                 AND c.deleted_at IS NULL
                 AND c.status IN ('active', 'needs_reauth', 'error')
           )
       ) THEN
        v_selection_valid := true;
    END IF;

    FOR v_connection_id IN
        SELECT c.id
        FROM bank_connections c
        WHERE c.household_id = p_household_id
          AND c.deleted_at IS NULL
          AND c.status IN ('active', 'needs_reauth', 'error')
          AND (
              (
                  v_selection_valid
                  AND NOT (c.id = ANY(v_selection.retained_connection_ids))
              )
              OR (
                  NOT v_selection_valid
                  AND c.id NOT IN (
                      SELECT kept.id
                      FROM bank_connections kept
                      WHERE kept.household_id = p_household_id
                        AND kept.deleted_at IS NULL
                        AND kept.status IN ('active', 'needs_reauth', 'error')
                      ORDER BY kept.created_at, kept.id
                      LIMIT v_cap
                  )
              )
          )
        ORDER BY c.created_at, c.id
    LOOP
        IF enqueue_bank_connection_revocation_internal(
            v_connection_id,
            'entitlement_downgrade',
            false
        ) IS NOT NULL THEN
            v_queued := v_queued + 1;
        END IF;
    END LOOP;

    IF v_selection_found THEN
        UPDATE bank_connection_retention_selections
        SET applied_at = now(),
            application = CASE WHEN v_selection_valid THEN 'explicit' ELSE 'fallback' END
        WHERE household_id = p_household_id;
    END IF;

    RETURN v_queued;
END;
$$;

-- Immediate provider-event reductions run in the same transaction that updates
-- the minimized projection. Clock-only expiry is covered by the worker sweep.
CREATE FUNCTION public.enforce_bank_connection_allowance_after_projection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.bank_connection_allowance > NEW.bank_connection_allowance THEN
        PERFORM enforce_bank_connection_allowance_internal(NEW.household_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_bank_allowance_after_projection
    AFTER UPDATE OF bank_connection_allowance ON current_household_entitlements
    FOR EACH ROW
    WHEN (OLD.bank_connection_allowance > NEW.bank_connection_allowance)
    EXECUTE FUNCTION public.enforce_bank_connection_allowance_after_projection();

CREATE FUNCTION public.enforce_due_bank_connection_downgrades(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (households_processed BIGINT, connections_queued BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID;
    v_households BIGINT := 0;
    v_connections BIGINT := 0;
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
        RAISE EXCEPTION 'limit must be between 1 and 200'
            USING ERRCODE = 'check_violation';
    END IF;

    FOR v_household_id IN
        SELECT h.id
        FROM households h
        WHERE h.deleted_at IS NULL
          AND EXISTS (
              SELECT 1
              FROM bank_connections c
              WHERE c.household_id = h.id
                AND c.deleted_at IS NULL
                AND c.status IN ('active', 'needs_reauth', 'error')
          )
          AND (
              SELECT count(*)
              FROM bank_connections c
              WHERE c.household_id = h.id
                AND c.deleted_at IS NULL
                AND c.status IN ('active', 'needs_reauth', 'error')
          ) > bank_connection_cap_for_household(h.id)
        ORDER BY h.id
        LIMIT p_limit
        FOR UPDATE OF h SKIP LOCKED
    LOOP
        v_households := v_households + 1;
        v_connections := v_connections
            + enforce_bank_connection_allowance_internal(v_household_id);
    END LOOP;

    RETURN QUERY SELECT v_households, v_connections;
END;
$$;

-- -----------------------------------------------------------------------------
-- SKIP LOCKED worker state machine
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.claim_bank_revocation_jobs(
    p_limit INTEGER DEFAULT 20,
    p_lease_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
    id UUID,
    provider TEXT,
    encrypted_access_token TEXT,
    lease_token UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'limit must be between 1 and 100'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
        RAISE EXCEPTION 'lease must be between 30 and 900 seconds'
            USING ERRCODE = 'check_violation';
    END IF;

    -- A crashed provider call is an ambiguous failure, never success.
    UPDATE bank_connection_orphaned_items
    SET status = CASE WHEN attempts >= max_attempts THEN 'exhausted' ELSE 'retry_wait' END,
        next_attempt_at = CASE WHEN attempts >= max_attempts THEN NULL ELSE now() END,
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error_code = 'WORKER_LEASE_EXPIRED'
    WHERE status = 'processing'
      AND lease_expires_at <= now();

    -- Reconciliation rows are never blindly revoked. If the connection exists,
    -- the duplicate credential is purged; otherwise the Item is safe to revoke.
    UPDATE bank_connection_orphaned_items o
    SET status = 'reconciled',
        encrypted_access_token = NULL,
        revoked_at = now(),
        next_attempt_at = NULL,
        last_error_code = 'CONNECTION_FINALIZED'
    WHERE o.status = 'pending_reconciliation'
      AND EXISTS (
          SELECT 1
          FROM bank_connections c
          WHERE c.id = o.connection_id
            AND c.deleted_at IS NULL
            AND c.status <> 'disconnected'
      );

    UPDATE bank_connection_orphaned_items o
    SET status = 'pending_revocation',
        next_attempt_at = now()
    WHERE o.status = 'pending_reconciliation'
      AND NOT EXISTS (
          SELECT 1
          FROM bank_connections c
          WHERE c.id = o.connection_id
            AND c.deleted_at IS NULL
            AND c.status <> 'disconnected'
      );

    RETURN QUERY
    WITH candidates AS (
        SELECT o.id
        FROM bank_connection_orphaned_items o
        WHERE o.status IN ('pending_revocation', 'retry_wait')
          AND o.next_attempt_at <= now()
          AND o.retain_until > now()
          AND o.attempts < o.max_attempts
        ORDER BY o.next_attempt_at, o.created_at, o.id
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE bank_connection_orphaned_items o
        SET status = 'processing',
            attempts = o.attempts + 1,
            lease_token = gen_random_uuid(),
            lease_expires_at = now() + make_interval(secs => p_lease_seconds),
            next_attempt_at = NULL
        FROM candidates c
        WHERE o.id = c.id
        RETURNING o.id, o.provider, o.encrypted_access_token, o.lease_token
    )
    SELECT claimed.id, claimed.provider, claimed.encrypted_access_token, claimed.lease_token
    FROM claimed;
END;
$$;

CREATE FUNCTION public.record_bank_revocation_result(
    p_id UUID,
    p_lease_token UUID,
    p_succeeded BOOLEAN,
    p_error_code TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job bank_connection_orphaned_items%ROWTYPE;
    v_delay_seconds INTEGER;
    v_status TEXT;
BEGIN
    IF p_error_code IS NOT NULL AND length(p_error_code) > 128 THEN
        RAISE EXCEPTION 'error code exceeds safe bound' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_job
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND status = 'processing'
      AND lease_token = p_lease_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'stale';
    END IF;

    IF p_succeeded THEN
        UPDATE bank_connection_orphaned_items
        SET status = 'revoked',
            encrypted_access_token = NULL,
            revoked_at = now(),
            next_attempt_at = NULL,
            lease_token = NULL,
            lease_expires_at = NULL,
            last_error_code = p_error_code
        WHERE id = v_job.id;

        IF v_job.connection_id IS NOT NULL THEN
            UPDATE bank_connections
            SET status = 'disconnected',
                deleted_at = COALESCE(deleted_at, now()),
                encrypted_access_token = NULL
            WHERE id = v_job.connection_id
              AND status = 'revocation_pending';
        END IF;
        RETURN 'revoked';
    END IF;

    IF v_job.attempts >= v_job.max_attempts THEN
        v_status := 'exhausted';
        UPDATE bank_connection_orphaned_items
        SET status = v_status,
            next_attempt_at = NULL,
            lease_token = NULL,
            lease_expires_at = NULL,
            last_error_code = COALESCE(p_error_code, 'REVOCATION_FAILED')
        WHERE id = v_job.id;
        RETURN v_status;
    END IF;

    -- 30s, 60s, 120s... capped at 1h. Jitter is in the upper half of the
    -- window, so retries are both bounded and de-correlated.
    v_delay_seconds := LEAST(
        3600,
        30 * power(2, LEAST(v_job.attempts - 1, 7))::INTEGER
    );
    v_delay_seconds := (v_delay_seconds / 2)
        + floor(random() * GREATEST(1, v_delay_seconds / 2))::INTEGER;

    UPDATE bank_connection_orphaned_items
    SET status = 'retry_wait',
        next_attempt_at = now() + make_interval(secs => v_delay_seconds),
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error_code = COALESCE(p_error_code, 'REVOCATION_FAILED')
    WHERE id = v_job.id;

    RETURN 'retry_wait';
END;
$$;

CREATE FUNCTION public.recover_exhausted_bank_revocations(p_limit INTEGER DEFAULT 20)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count BIGINT;
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'limit must be between 1 and 100'
            USING ERRCODE = 'check_violation';
    END IF;

    WITH candidates AS (
        SELECT id
        FROM bank_connection_orphaned_items
        WHERE status = 'exhausted'
          AND recovery_attempts < 2
          AND retain_until > now()
        ORDER BY created_at, id
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    ),
    recovered AS (
        UPDATE bank_connection_orphaned_items o
        SET status = 'pending_revocation',
            attempts = 0,
            recovery_attempts = recovery_attempts + 1,
            next_attempt_at = now(),
            last_error_code = 'EXHAUSTED_RECOVERY'
        FROM candidates c
        WHERE o.id = c.id
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM recovered;

    RETURN v_count;
END;
$$;

CREATE FUNCTION public.bank_revocation_reconciliation_summary()
RETURNS TABLE (status TEXT, reason TEXT, jobs BIGINT, oldest_created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT o.status, o.reason, count(*), min(o.created_at)
    FROM bank_connection_orphaned_items o
    GROUP BY o.status, o.reason
    ORDER BY o.status, o.reason;
$$;

-- Account deletion first moves every live credential into the durable outbox,
-- then severs all user/household/connection identifiers. Provider outage never
-- blocks erasure; a database failure does, because deleting first would destroy
-- the only processor-erasure capability.
CREATE FUNCTION public.sever_bank_revocation_identities_for_account(
    p_owner_id UUID,
    p_household_ids UUID[] DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_connection_id UUID;
    v_count BIGINT := 0;
BEGIN
    FOR v_connection_id IN
        SELECT c.id
        FROM bank_connections c
        WHERE c.deleted_at IS NULL
          AND (
              c.owner_id = p_owner_id
              OR (
                  p_household_ids IS NOT NULL
                  AND c.household_id = ANY(p_household_ids)
              )
          )
          AND c.status <> 'disconnected'
        ORDER BY c.created_at, c.id
        FOR UPDATE
    LOOP
        IF enqueue_bank_connection_revocation_internal(
            v_connection_id,
            'account_deletion',
            true
        ) IS NOT NULL THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;

    UPDATE bank_connection_orphaned_items
    SET reason = CASE
            WHEN status IN (
                'pending_revocation',
                'pending_reconciliation',
                'processing',
                'retry_wait',
                'exhausted'
            )
            THEN 'account_deletion'
            ELSE reason
        END,
        erasure_requested_at = CASE
            WHEN status IN (
                'pending_revocation',
                'pending_reconciliation',
                'processing',
                'retry_wait',
                'exhausted'
            )
            THEN COALESCE(erasure_requested_at, now())
            ELSE erasure_requested_at
        END,
        retain_until = CASE
            WHEN status IN (
                'pending_revocation',
                'pending_reconciliation',
                'processing',
                'retry_wait',
                'exhausted'
            )
            THEN LEAST(retain_until, now() + interval '7 days')
            ELSE retain_until
        END,
        owner_id = NULL,
        household_id = NULL,
        connection_id = NULL
    WHERE (
          owner_id = p_owner_id
          OR (
              p_household_ids IS NOT NULL
              AND household_id = ANY(p_household_ids)
          )
      );

    RETURN v_count;
END;
$$;

-- Extend the Stage 6 retention backstop to every credential-bearing state.
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
            next_attempt_at = NULL,
            lease_token = NULL,
            lease_expires_at = NULL,
            last_error_code = COALESCE(last_error_code, 'RETENTION_EXPIRED')
        WHERE status IN (
            'pending_revocation',
            'pending_reconciliation',
            'processing',
            'retry_wait',
            'exhausted'
        )
          AND retain_until <= now()
        RETURNING 1
    )
    SELECT count(*) INTO v_abandoned FROM expired;

    WITH purged AS (
        DELETE FROM bank_connection_orphaned_items
        WHERE status IN ('revoked', 'reconciled', 'abandoned')
          AND revoked_at <= now() - COALESCE(p_terminal_retention, interval '90 days')
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM purged;

    RETURN QUERY SELECT v_abandoned, v_deleted;
END;
$$;

-- -----------------------------------------------------------------------------
-- Least privilege
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation_internal(UUID, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_bank_connection_revocation(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_bank_connection_retention_selection(UUID, UUID, UUID[])
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_bank_connection_allowance_internal(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_bank_connection_allowance_after_projection()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_due_bank_connection_downgrades(INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_bank_revocation_jobs(INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_bank_revocation_result(UUID, UUID, BOOLEAN, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recover_exhausted_bank_revocations(INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bank_revocation_reconciliation_summary()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sever_bank_revocation_identities_for_account(UUID, UUID[])
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.request_bank_connection_revocation(UUID, UUID)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation_internal(UUID, TEXT, BOOLEAN)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.save_bank_connection_retention_selection(UUID, UUID, UUID[])
    TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_due_bank_connection_downgrades(INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_bank_revocation_jobs(INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.record_bank_revocation_result(UUID, UUID, BOOLEAN, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_exhausted_bank_revocations(INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.bank_revocation_reconciliation_summary()
    TO service_role;
GRANT EXECUTE ON FUNCTION public.sever_bank_revocation_identities_for_account(UUID, UUID[])
    TO service_role;

-- =============================================================================
-- Rollback: down/20260908000002_durable_bank_revocation.down.sql
-- =============================================================================
