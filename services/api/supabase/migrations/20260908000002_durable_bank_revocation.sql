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
    ADD COLUMN revocation_enqueued_at TIMESTAMPTZ,
    DROP CONSTRAINT bank_connections_status_valid,
    ADD CONSTRAINT bank_connections_status_valid CHECK (
        status IN ('active', 'needs_reauth', 'revocation_pending', 'disconnected', 'error')
    ),
    ADD CONSTRAINT bank_connections_credential_state_check CHECK (
        (
            status IN ('active', 'needs_reauth', 'error')
            AND deleted_at IS NULL
            AND encrypted_access_token IS NOT NULL
            AND revocation_enqueued_at IS NULL
        )
        OR (
            status = 'revocation_pending'
            AND deleted_at IS NULL
            AND encrypted_access_token IS NULL
            AND revocation_enqueued_at IS NOT NULL
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

CREATE FUNCTION public.protect_bank_connection_revocation_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') THEN
        IF (
            TG_OP = 'INSERT'
            AND (
                NEW.status IN ('revocation_pending', 'disconnected')
                OR NEW.revocation_enqueued_at IS NOT NULL
            )
        ) OR (
            TG_OP = 'UPDATE'
            AND (
                NEW.revocation_enqueued_at IS DISTINCT FROM OLD.revocation_enqueued_at
                OR (
                    OLD.status IS DISTINCT FROM NEW.status
                    AND (
                        OLD.status IN ('revocation_pending', 'disconnected')
                        OR NEW.status IN ('revocation_pending', 'disconnected')
                    )
                )
                OR (
                    OLD.encrypted_access_token IS NOT NULL
                    AND NEW.encrypted_access_token IS NULL
                )
            )
        ) THEN
            RAISE EXCEPTION 'revocation state is server-managed'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_bank_connection_revocation_state
    BEFORE INSERT OR UPDATE OF status, encrypted_access_token, revocation_enqueued_at
    ON bank_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_bank_connection_revocation_state();

COMMENT ON COLUMN bank_connections.status IS
    'active/needs_reauth/error may synchronize; revocation_pending is disabled '
    'immediately while the server-only outbox retries provider erasure; '
    'disconnected is terminal after provider revoked/already-invalid.';

CREATE OR REPLACE FUNCTION public.bank_connection_consumes_cap(
    p_status TEXT,
    p_deleted_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT p_deleted_at IS NULL
       AND p_status IN ('active', 'needs_reauth', 'error');
$$;

REVOKE EXECUTE ON FUNCTION public.bank_connection_consumes_cap(TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bank_connection_consumes_cap(TEXT, TIMESTAMPTZ)
    TO service_role;

-- Every Stage 6 capacity boundary uses the same Stage 7 definition of a
-- billable live row. A queued revocation releases capacity immediately while
-- its non-deleted connection history remains available to server workflows.
CREATE OR REPLACE FUNCTION public.reserve_bank_connection_slot(
    p_household_id UUID,
    p_owner_id UUID,
    p_provider TEXT,
    p_ttl_seconds INTEGER DEFAULT 900
)
RETURNS TABLE (
    status         TEXT,
    reservation_id UUID,
    cap            BIGINT,
    used           BIGINT,
    expires_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_authorized BOOLEAN;
    v_cap        BIGINT;
    v_live       BIGINT;
    v_reserved   BIGINT;
    v_expires    TIMESTAMPTZ;
    v_id         UUID;
BEGIN
    IF p_provider IS NULL OR p_provider NOT IN ('plaid', 'mx') THEN
        RAISE EXCEPTION 'invalid provider' USING ERRCODE = 'check_violation';
    END IF;
    IF p_owner_id IS NULL THEN
        RAISE EXCEPTION 'owner is required' USING ERRCODE = 'not_null_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('bank-connection-owner:' || p_owner_id::TEXT, 0)
    );

    SELECT
        EXISTS (
            SELECT 1
            FROM users u
            WHERE u.id = p_owner_id
              AND u.deleted_at IS NULL
        )
        AND (
            EXISTS (
                SELECT 1 FROM household_members m
                WHERE m.household_id = p_household_id
                  AND m.user_id = p_owner_id
                  AND m.deleted_at IS NULL
                  AND m.role IN ('owner', 'admin')
            )
            OR EXISTS (
                SELECT 1 FROM households h
                WHERE h.id = p_household_id
                  AND h.created_by = p_owner_id
                  AND h.deleted_at IS NULL
            )
        )
    INTO v_authorized;

    IF NOT v_authorized THEN
        RETURN QUERY SELECT 'forbidden'::TEXT, NULL::UUID, NULL::BIGINT, NULL::BIGINT,
                            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    DELETE FROM bank_connection_reservations
    WHERE household_id = p_household_id
      AND bank_connection_reservations.expires_at <= now();

    v_cap := bank_connection_cap_for_household(p_household_id);

    SELECT count(*) INTO v_live
    FROM bank_connections c
    WHERE c.household_id = p_household_id
      AND bank_connection_consumes_cap(c.status, c.deleted_at);

    SELECT count(*) INTO v_reserved
    FROM bank_connection_reservations
    WHERE household_id = p_household_id
      AND bank_connection_reservations.expires_at > now();

    IF v_cap <= 0 THEN
        RETURN QUERY SELECT 'premium_required'::TEXT, NULL::UUID, v_cap, (v_live + v_reserved),
                            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF (v_live + v_reserved) >= v_cap THEN
        RETURN QUERY SELECT 'at_cap'::TEXT, NULL::UUID, v_cap, (v_live + v_reserved),
                            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    v_expires := now() + make_interval(secs => GREATEST(COALESCE(p_ttl_seconds, 900), 1));

    INSERT INTO bank_connection_reservations (household_id, owner_id, provider, expires_at)
    VALUES (p_household_id, p_owner_id, p_provider, v_expires)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT 'reserved'::TEXT, v_id, v_cap, (v_live + v_reserved + 1), v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION public.bank_connection_capacity(p_household_id UUID)
RETURNS TABLE (cap BIGINT, used BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        bank_connection_cap_for_household(p_household_id),
        (
            SELECT count(*) FROM bank_connections c
            WHERE c.household_id = p_household_id
              AND bank_connection_consumes_cap(c.status, c.deleted_at)
        )
        + (
            SELECT count(*) FROM bank_connection_reservations
            WHERE household_id = p_household_id AND expires_at > now()
        );
$$;

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
    v_handoff_id  UUID;
    v_cap         BIGINT;
    v_live        BIGINT;
    v_reserved    BIGINT;
    v_id          UUID;
    v_created_at  TIMESTAMPTZ;
BEGIN
    IF p_provider IS NULL OR p_provider NOT IN ('plaid', 'mx') THEN
        RAISE EXCEPTION 'invalid provider' USING ERRCODE = 'check_violation';
    END IF;
    IF p_owner_id IS NULL THEN
        RAISE EXCEPTION 'owner is required' USING ERRCODE = 'not_null_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('bank-connection-owner:' || p_owner_id::TEXT, 0)
    );
    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    IF NOT EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = p_owner_id
          AND u.deleted_at IS NULL
    ) THEN
        DELETE FROM bank_connection_reservations
        WHERE id = p_reservation_id
          AND household_id = p_household_id;

        RETURN QUERY SELECT
            'already_disconnected'::TEXT,
            NULL::UUID,
            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF p_connection_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM bank_connections
        WHERE id = p_connection_id AND household_id = p_household_id
        FOR UPDATE;

        IF FOUND THEN
            DELETE FROM bank_connection_reservations
            WHERE id = p_reservation_id
              AND household_id = p_household_id;

            IF bank_connection_consumes_cap(v_existing.status, v_existing.deleted_at) THEN
                RETURN QUERY SELECT 'finalized'::TEXT, v_existing.id, v_existing.created_at;
            ELSE
                RETURN QUERY SELECT 'already_disconnected'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
            END IF;
            RETURN;
        END IF;

        -- A reconciliation handoff is a durable tombstone created under this
        -- same household lock. Once it wins, this provider Item belongs to the
        -- revocation worker and finalization must never recreate a live row.
        SELECT id INTO v_handoff_id
        FROM bank_connection_orphaned_items
        WHERE connection_id = p_connection_id
        ORDER BY created_at, id
        LIMIT 1
        FOR UPDATE;

        IF v_handoff_id IS NOT NULL THEN
            DELETE FROM bank_connection_reservations
            WHERE id = p_reservation_id
              AND household_id = p_household_id;

            RETURN QUERY SELECT
                'already_disconnected'::TEXT,
                NULL::UUID,
                NULL::TIMESTAMPTZ;
            RETURN;
        END IF;
    END IF;

    DELETE FROM bank_connection_reservations
    WHERE household_id = p_household_id
      AND expires_at <= clock_timestamp()
      AND id <> p_reservation_id;

    SELECT * INTO v_reservation
    FROM bank_connection_reservations
    WHERE id = p_reservation_id AND household_id = p_household_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'reservation_not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF v_reservation.expires_at <= clock_timestamp() THEN
        DELETE FROM bank_connection_reservations WHERE id = p_reservation_id;
        RETURN QUERY SELECT 'reservation_not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    DELETE FROM bank_connection_reservations WHERE id = p_reservation_id;
    v_cap := bank_connection_cap_for_household(p_household_id);

    SELECT count(*) INTO v_live
    FROM bank_connections c
    WHERE c.household_id = p_household_id
      AND bank_connection_consumes_cap(c.status, c.deleted_at);

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
        id, household_id, owner_id, provider, institution_id, institution_name,
        encrypted_access_token, status, metadata
    )
    VALUES (
        COALESCE(p_connection_id, gen_random_uuid()), p_household_id, p_owner_id,
        p_provider, p_institution_id, p_institution_name, p_encrypted_access_token,
        'active', COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id, bank_connections.created_at INTO v_id, v_created_at;

    RETURN QUERY SELECT 'finalized'::TEXT, v_id, v_created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_bank_connection_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cap  BIGINT;
    v_used BIGINT;
BEGIN
    IF NOT bank_connection_consumes_cap(NEW.status, NEW.deleted_at) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND bank_connection_consumes_cap(OLD.status, OLD.deleted_at)
       AND OLD.household_id = NEW.household_id THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(NEW.household_id));
    v_cap := bank_connection_cap_for_household(NEW.household_id);

    SELECT
        (
            SELECT count(*) FROM bank_connections c
            WHERE c.household_id = NEW.household_id
              AND bank_connection_consumes_cap(c.status, c.deleted_at)
              AND c.id <> NEW.id
        )
        + (
            SELECT count(*) FROM bank_connection_reservations
            WHERE household_id = NEW.household_id AND expires_at > now()
        )
    INTO v_used;

    IF v_used >= v_cap THEN
        RAISE EXCEPTION
            'Household % has reached its bank connection allowance of %',
            NEW.household_id, v_cap
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_connections_cap ON bank_connections;
CREATE TRIGGER trg_bank_connections_cap
    BEFORE INSERT OR UPDATE OF household_id, deleted_at, status
    ON bank_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_bank_connection_cap();

-- The Stage 6 table is deliberately retained rather than creating a second
-- queue. These columns turn it into the unified revocation state machine.
ALTER TABLE bank_connection_orphaned_items
    ADD COLUMN reason TEXT NOT NULL DEFAULT 'finalization_failure',
    ADD COLUMN connection_previous_status TEXT,
    ADD COLUMN next_attempt_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN lease_token UUID,
    ADD COLUMN lease_expires_at TIMESTAMPTZ,
    ADD COLUMN provider_work_started_at TIMESTAMPTZ,
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
    ADD CONSTRAINT bank_connection_orphaned_items_previous_status_valid CHECK (
        connection_previous_status IS NULL
        OR connection_previous_status IN ('active', 'needs_reauth', 'error')
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

COMMENT ON COLUMN bank_connection_orphaned_items.provider_work_started_at IS
    'Set atomically when a lease first exposes the encrypted credential to a '
    'provider worker. A non-null value makes rollback unsafe because the '
    'provider result may be externally irreversible or ambiguous.';

-- Stage 6's direct mutators bypass leases and bounded retry accounting. Stage 7
-- owns every transition through the claim/result state machine instead.
DROP FUNCTION IF EXISTS public.complete_orphaned_bank_item(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_orphaned_bank_item_attempt(UUID, TEXT);
DROP FUNCTION IF EXISTS public.claim_orphaned_bank_items_for_erasure(UUID, UUID[]);

-- Unknown finalization handoff shares the finalizer's household lock. The
-- outbox row is therefore a connection-ID tombstone: finalization-first
-- produces a credential-free reconciled audit row, while handoff-first blocks
-- every later finalization replay from creating an active connection.
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
    v_connection bank_connections%ROWTYPE;
    v_existing_id UUID;
    v_effective_status TEXT;
    v_owner_active BOOLEAN;
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
    IF p_owner_id IS NULL THEN
        RAISE EXCEPTION 'owner is required' USING ERRCODE = 'not_null_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('bank-connection-owner:' || p_owner_id::TEXT, 0)
    );
    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));
    SELECT EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = p_owner_id
          AND u.deleted_at IS NULL
    ) INTO v_owner_active;
    v_effective_status := CASE WHEN v_owner_active THEN p_status ELSE 'pending_revocation' END;

    IF v_owner_active AND p_connection_id IS NOT NULL THEN
        SELECT * INTO v_connection
        FROM bank_connections
        WHERE id = p_connection_id
          AND household_id = p_household_id
        FOR UPDATE;

        SELECT id INTO v_existing_id
        FROM bank_connection_orphaned_items
        WHERE connection_id = p_connection_id
        ORDER BY created_at, id
        LIMIT 1
        FOR UPDATE;

        IF v_existing_id IS NOT NULL THEN
            RETURN v_existing_id;
        END IF;

        IF v_connection.id IS NOT NULL
           AND bank_connection_consumes_cap(
               v_connection.status,
               v_connection.deleted_at
           ) THEN
            v_effective_status := 'pending_reconciliation';
        END IF;
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
        last_error_code,
        erasure_requested_at,
        retain_until
    )
    VALUES (
        CASE WHEN v_owner_active THEN p_household_id ELSE NULL END,
        CASE WHEN v_owner_active THEN p_owner_id ELSE NULL END,
        CASE WHEN v_owner_active THEN p_connection_id ELSE NULL END,
        p_provider,
        p_encrypted_access_token,
        v_effective_status,
        1,
        CASE WHEN v_owner_active THEN 'finalization_failure' ELSE 'account_deletion' END,
        p_last_error_code,
        CASE WHEN v_owner_active THEN NULL ELSE now() END,
        CASE
            WHEN v_owner_active THEN now() + interval '30 days'
            ELSE now() + interval '7 days'
        END
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_orphaned_bank_item(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
) IS
    'Durably records a provider Item under the household finalization lock '
    '(#4405). The connection id becomes a tombstone: an existing live '
    'connection forces reconciliation before any revocation; an absent '
    'connection blocks every later finalization replay and remains available '
    'for bounded provider revocation.';

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
        -- Only a first transition into account deletion may override retry
        -- scheduling. Duplicate requests must not bypass backoff or exhaustion.
        UPDATE bank_connection_orphaned_items
        SET status = CASE
                WHEN p_reason = 'account_deletion'
                     AND reason <> 'account_deletion'
                     AND status IN ('pending_reconciliation', 'exhausted')
                THEN 'pending_revocation'
                ELSE status
            END,
            reason = CASE
                WHEN p_reason = 'account_deletion'
                     AND reason <> 'account_deletion'
                THEN 'account_deletion'
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
            connection_previous_status = COALESCE(
                connection_previous_status,
                CASE
                    WHEN v_connection.status IN ('active', 'needs_reauth', 'error')
                    THEN v_connection.status
                    ELSE NULL
                END
            ),
            attempts = CASE
                WHEN p_reason = 'account_deletion'
                     AND reason <> 'account_deletion'
                     AND status = 'exhausted'
                THEN 0
                ELSE attempts
            END,
            next_attempt_at = CASE
                WHEN p_reason = 'account_deletion'
                     AND reason <> 'account_deletion'
                THEN now()
                ELSE next_attempt_at
            END,
            last_error_code = CASE
                WHEN p_reason = 'account_deletion'
                     AND reason <> 'account_deletion'
                     AND status = 'exhausted'
                THEN NULL
                ELSE last_error_code
            END,
            owner_id = CASE WHEN p_detach_identity THEN NULL ELSE owner_id END,
            household_id = CASE WHEN p_detach_identity THEN NULL ELSE household_id END,
            connection_id = CASE WHEN p_detach_identity THEN NULL ELSE connection_id END
        WHERE id = v_existing;

        UPDATE bank_connections
        SET status = 'revocation_pending',
            encrypted_access_token = NULL,
            revocation_enqueued_at = COALESCE(revocation_enqueued_at, now()),
            error_code = NULL,
            error_message = NULL
        WHERE id = v_connection.id
          AND deleted_at IS NULL
          AND status <> 'disconnected';
        RETURN v_existing;
    END IF;

    -- Repeated account deletion calls arrive after the first call has severed
    -- the outbox identity. The pending row proves the durable handoff already
    -- committed, so a missing connection credential is an idempotent no-op.
    IF v_connection.status = 'revocation_pending'
       AND v_connection.encrypted_access_token IS NULL THEN
        IF v_connection.revocation_enqueued_at IS NULL THEN
            RAISE EXCEPTION 'revocation handoff marker is unavailable'
                USING ERRCODE = 'not_null_violation';
        END IF;
        RETURN NULL;
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
        connection_previous_status,
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
        v_connection.status,
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
        revocation_enqueued_at = now(),
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
       AND v_projection.projection_version >= v_selection.projection_version
       AND v_projection.source_base_grant_id IS NOT DISTINCT FROM
           v_selection.entitlement_grant_id
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
DECLARE
    v_reconciliation RECORD;
    v_connection_is_live BOOLEAN;
    v_household_locked BOOLEAN;
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'limit must be between 1 and 100'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
        RAISE EXCEPTION 'lease must be between 30 and 900 seconds'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Reconciliation uses the same advisory -> connection -> outbox order as
    -- finalization and handoff creation. A handoff row is therefore a durable
    -- tombstone: once it exists, no later finalization can race an absent read
    -- and create an active connection behind a revoked provider Item.
    FOR v_reconciliation IN
        SELECT o.id, o.household_id, o.connection_id
        FROM bank_connection_orphaned_items o
        WHERE o.status = 'pending_reconciliation'
        ORDER BY o.household_id NULLS LAST, o.created_at, o.id
        LIMIT p_limit
    LOOP
        IF v_reconciliation.household_id IS NOT NULL THEN
            SELECT pg_try_advisory_xact_lock(
                bank_connection_reservation_lock_key(v_reconciliation.household_id)
            ) INTO v_household_locked;

            IF NOT v_household_locked THEN
                CONTINUE;
            END IF;
        END IF;

        v_connection_is_live := false;
        IF v_reconciliation.connection_id IS NOT NULL THEN
            BEGIN
                SELECT true INTO v_connection_is_live
                FROM bank_connections c
                WHERE c.id = v_reconciliation.connection_id
                  AND bank_connection_consumes_cap(c.status, c.deleted_at)
                FOR UPDATE NOWAIT;
                v_connection_is_live := COALESCE(v_connection_is_live, false);
            EXCEPTION
                WHEN lock_not_available THEN
                    CONTINUE;
            END;
        END IF;

        BEGIN
            PERFORM 1
            FROM bank_connection_orphaned_items o
            WHERE o.id = v_reconciliation.id
              AND o.status = 'pending_reconciliation'
              AND o.household_id IS NOT DISTINCT FROM v_reconciliation.household_id
              AND o.connection_id IS NOT DISTINCT FROM v_reconciliation.connection_id
            FOR UPDATE NOWAIT;
        EXCEPTION
            WHEN lock_not_available THEN
                CONTINUE;
        END;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        IF v_connection_is_live THEN
            UPDATE bank_connection_orphaned_items
            SET status = 'reconciled',
                encrypted_access_token = NULL,
                revoked_at = now(),
                next_attempt_at = NULL,
                last_error_code = 'CONNECTION_FINALIZED'
            WHERE id = v_reconciliation.id;
        ELSE
            UPDATE bank_connection_orphaned_items
            SET status = 'pending_revocation',
                next_attempt_at = now()
            WHERE id = v_reconciliation.id;
        END IF;
    END LOOP;

    -- A crashed provider call is an ambiguous failure, never success. This
    -- outbox-only mutation runs after every connection-locking reconciliation
    -- step so the transaction never acquires a connection behind an outbox.
    UPDATE bank_connection_orphaned_items
    SET status = CASE WHEN attempts >= max_attempts THEN 'exhausted' ELSE 'retry_wait' END,
        next_attempt_at = CASE WHEN attempts >= max_attempts THEN NULL ELSE now() END,
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error_code = 'WORKER_LEASE_EXPIRED'
    WHERE status = 'processing'
      AND lease_expires_at <= now();

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
            provider_work_started_at = COALESCE(o.provider_work_started_at, now()),
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
    v_candidate_connection_id UUID;
    v_delay_seconds INTEGER;
    v_status TEXT;
BEGIN
    IF p_error_code IS NOT NULL AND length(p_error_code) > 128 THEN
        RAISE EXCEPTION 'error code exceeds safe bound' USING ERRCODE = 'check_violation';
    END IF;

    -- Match every path that touches both tables: connection first, outbox
    -- second. This non-locking read may race with identity severance, so the
    -- locked outbox row is revalidated below before any mutation.
    SELECT connection_id INTO v_candidate_connection_id
    FROM bank_connection_orphaned_items
    WHERE id = p_id;

    IF v_candidate_connection_id IS NOT NULL THEN
        PERFORM 1
        FROM bank_connections
        WHERE id = v_candidate_connection_id
        FOR UPDATE;
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

    IF v_job.connection_id IS NOT NULL
       AND v_job.connection_id IS DISTINCT FROM v_candidate_connection_id THEN
        RAISE EXCEPTION 'revocation identity changed while acquiring locks'
            USING ERRCODE = 'serialization_failure';
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
    v_household_id UUID;
    v_connection_id UUID;
    v_count BIGINT := 0;
BEGIN
    IF p_owner_id IS NULL THEN
        RAISE EXCEPTION 'owner is required' USING ERRCODE = 'not_null_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('bank-connection-owner:' || p_owner_id::TEXT, 0)
    );

    UPDATE users
    SET deleted_at = COALESCE(deleted_at, now())
    WHERE id = p_owner_id;

    -- Serialize every household that can still finalize a reservation before
    -- identities are removed. If finalization won, its connection is observed
    -- below; if erasure won, deleting the reservation makes every delayed
    -- finalizer return a definitive non-finalized result.
    FOR v_household_id IN
        SELECT DISTINCT scope.household_id
        FROM (
            SELECT unnest(p_household_ids) AS household_id
            WHERE p_household_ids IS NOT NULL
            UNION
            SELECT c.household_id
            FROM bank_connections c
            WHERE c.owner_id = p_owner_id
               OR (
                   p_household_ids IS NOT NULL
                   AND c.household_id = ANY(p_household_ids)
               )
            UNION
            SELECT o.household_id
            FROM bank_connection_orphaned_items o
            WHERE o.owner_id = p_owner_id
               OR (
                   p_household_ids IS NOT NULL
                   AND o.household_id = ANY(p_household_ids)
               )
            UNION
            SELECT r.household_id
            FROM bank_connection_reservations r
            WHERE r.owner_id = p_owner_id
               OR (
                   p_household_ids IS NOT NULL
                   AND r.household_id = ANY(p_household_ids)
               )
        ) AS scope
        WHERE scope.household_id IS NOT NULL
        ORDER BY scope.household_id
    LOOP
        PERFORM pg_advisory_xact_lock(
            bank_connection_reservation_lock_key(v_household_id)
        );
    END LOOP;

    DELETE FROM bank_connection_reservations r
    WHERE r.owner_id = p_owner_id
       OR (
           p_household_ids IS NOT NULL
           AND r.household_id = ANY(p_household_ids)
       );

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
    SET status = CASE
            WHEN reason <> 'account_deletion'
                 AND status IN ('pending_reconciliation', 'exhausted')
            THEN 'pending_revocation'
            ELSE status
        END,
        reason = CASE
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
        attempts = CASE
            WHEN reason <> 'account_deletion'
                 AND status = 'exhausted'
            THEN 0
            ELSE attempts
        END,
        next_attempt_at = CASE
            WHEN reason <> 'account_deletion'
                 AND status IN (
                     'pending_revocation',
                     'pending_reconciliation',
                     'processing',
                     'retry_wait',
                     'exhausted'
                 )
            THEN now()
            ELSE next_attempt_at
        END,
        last_error_code = CASE
            WHEN reason <> 'account_deletion'
                 AND status = 'exhausted'
            THEN NULL
            ELSE last_error_code
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
        DELETE FROM bank_connection_orphaned_items o
        WHERE o.status IN ('revoked', 'reconciled', 'abandoned')
          AND o.revoked_at <= now() - COALESCE(p_terminal_retention, interval '90 days')
          AND NOT EXISTS (
              SELECT 1
              FROM bank_connection_reservations r
              WHERE r.household_id = o.household_id
                AND r.owner_id = o.owner_id
                AND r.provider = o.provider
                AND r.expires_at > clock_timestamp()
          )
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
