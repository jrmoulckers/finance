-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260908000002_durable_bank_revocation
-- Description: Durable downgrade selection and provider-revocation outbox
-- Issue: #4405
--
-- The Stage 6 orphan handoff is promoted into the single canonical revocation
-- outbox. Provider credentials move into it transactionally before a live
-- connection is disabled or an account erasure removes its beneficiary rows.
-- The outbox remains server-only and outside PowerSync and data exports.

-- =============================================================================
-- Connection state: disable synchronization before provider work
-- =============================================================================

ALTER TABLE bank_connections
    ALTER COLUMN encrypted_access_token DROP NOT NULL,
    ADD COLUMN sync_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN sync_disabled_at TIMESTAMPTZ;

ALTER TABLE bank_connections
    DROP CONSTRAINT bank_connections_status_valid;
ALTER TABLE bank_connections
    ADD CONSTRAINT bank_connections_status_valid CHECK (
        status IN ('active', 'needs_reauth', 'revocation_pending', 'disconnected', 'error')
    ),
    ADD CONSTRAINT bank_connections_revocation_state_check CHECK (
        (
            status = 'revocation_pending'
            AND sync_enabled = false
            AND sync_disabled_at IS NOT NULL
            AND encrypted_access_token IS NULL
            AND deleted_at IS NULL
        )
        OR (
            status = 'disconnected'
            AND sync_enabled = false
            AND sync_disabled_at IS NOT NULL
            AND encrypted_access_token IS NULL
        )
        OR (
            status IN ('active', 'needs_reauth', 'error')
            AND sync_enabled = true
            AND sync_disabled_at IS NULL
            AND encrypted_access_token IS NOT NULL
            AND deleted_at IS NULL
        )
    );

CREATE INDEX idx_bank_connections_sync_eligible
    ON bank_connections (provider, status)
    WHERE deleted_at IS NULL AND sync_enabled;

COMMENT ON COLUMN bank_connections.sync_enabled IS
    'Server-controlled ingestion gate (#4405). False immediately when durable '
    'provider revocation is enqueued; clients cannot re-enable it.';
COMMENT ON COLUMN bank_connections.sync_disabled_at IS
    'When provider ingestion was disabled before durable revocation processing.';

-- Connections are managed by authenticated Edge Functions with service-role
-- RPCs. Direct client writes could otherwise re-enable a downgraded Item.
REVOKE INSERT, UPDATE, DELETE ON TABLE bank_connections FROM authenticated, anon;

-- =============================================================================
-- Canonical durable revocation outbox
-- =============================================================================

ALTER TABLE bank_connection_orphaned_items
    ADD COLUMN operation TEXT NOT NULL DEFAULT 'orphan_finalization',
    ADD COLUMN idempotency_key TEXT,
    ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN last_attempt_at TIMESTAMPTZ,
    ADD COLUMN claim_token UUID,
    ADD COLUMN claim_expires_at TIMESTAMPTZ,
    ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 12,
    ADD COLUMN completed_at TIMESTAMPTZ;

UPDATE bank_connection_orphaned_items
SET idempotency_key = 'orphan:' || id::text,
    attempts = CASE
        WHEN status IN ('pending_revocation', 'pending_reconciliation')
        THEN LEAST(attempts, 31)
        ELSE LEAST(attempts, 32)
    END,
    max_attempts = CASE
        WHEN status IN ('pending_revocation', 'pending_reconciliation')
        THEN GREATEST(12, LEAST(attempts::BIGINT + 1, 32)::INTEGER)
        ELSE GREATEST(12, LEAST(attempts, 32))
    END,
    completed_at = CASE
        WHEN status IN ('revoked', 'abandoned')
        THEN COALESCE(revoked_at, updated_at, now())
        ELSE NULL
    END,
    last_error_code = CASE
        WHEN last_error_code IS NULL
          OR last_error_code ~ '^[A-Z0-9_:-]{1,96}$'
        THEN last_error_code
        ELSE 'LEGACY_REVOCATION_FAILURE'
    END;

ALTER TABLE bank_connection_orphaned_items
    ALTER COLUMN idempotency_key SET NOT NULL,
    ADD CONSTRAINT bank_connection_revocations_operation_check CHECK (
        operation IN (
            'orphan_finalization',
            'downgrade',
            'user_disconnect',
            'account_deletion'
        )
    ),
    ADD CONSTRAINT bank_connection_revocations_idempotency_check CHECK (
        idempotency_key = btrim(idempotency_key)
        AND char_length(idempotency_key) BETWEEN 1 AND 128
    ),
    ADD CONSTRAINT bank_connection_revocations_attempt_bound_check CHECK (
        max_attempts BETWEEN 1 AND 32 AND attempts <= max_attempts
    ),
    ADD CONSTRAINT bank_connection_revocations_error_code_check CHECK (
        last_error_code IS NULL
        OR (
            last_error_code = btrim(last_error_code)
            AND char_length(last_error_code) BETWEEN 1 AND 96
            AND last_error_code ~ '^[A-Z0-9_:-]+$'
        )
    ),
    ADD CONSTRAINT bank_connection_revocations_claim_check CHECK (
        (status = 'processing' AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)
        OR (status <> 'processing' AND claim_token IS NULL AND claim_expires_at IS NULL)
    );

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT bank_connection_orphaned_items_status_valid,
    DROP CONSTRAINT bank_connection_orphaned_items_terminal_check;
ALTER TABLE bank_connection_orphaned_items
    ADD CONSTRAINT bank_connection_orphaned_items_status_valid CHECK (
        status IN (
            'pending_revocation',
            'pending_reconciliation',
            'processing',
            'exhausted',
            'revoked',
            'already_invalid',
            'retained',
            'abandoned'
        )
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_terminal_check CHECK (
        (
            status IN (
                'pending_revocation',
                'pending_reconciliation',
                'processing',
                'exhausted'
            )
            AND revoked_at IS NULL
            AND completed_at IS NULL
            AND encrypted_access_token IS NOT NULL
        )
        OR (
            status IN ('revoked', 'already_invalid', 'retained', 'abandoned')
            AND revoked_at IS NOT NULL
            AND completed_at IS NOT NULL
            AND encrypted_access_token IS NULL
        )
    );

CREATE UNIQUE INDEX idx_bank_connection_revocations_idempotency
    ON bank_connection_orphaned_items (idempotency_key);
CREATE INDEX idx_bank_connection_revocations_due
    ON bank_connection_orphaned_items (next_attempt_at, created_at, id)
    WHERE status = 'pending_revocation';
CREATE INDEX idx_bank_connection_revocations_reconcile
    ON bank_connection_orphaned_items (created_at, id)
    WHERE status = 'pending_reconciliation';
CREATE INDEX idx_bank_connection_revocations_claim_expiry
    ON bank_connection_orphaned_items (claim_expires_at)
    WHERE status = 'processing';
CREATE INDEX idx_bank_connection_revocations_alert
    ON bank_connection_orphaned_items (status, retain_until, created_at);

COMMENT ON TABLE bank_connection_orphaned_items IS
    'Canonical server-only provider revocation outbox (#4405), promoted from '
    'the Stage 6 orphan handoff. Contains only provider, minimum encrypted '
    'revocation credential, retry/disposition state, safe error code, and '
    'minimized audit metadata. It has no client policy, PowerSync rule, or '
    'export surface. Account erasure nulls beneficiary references promptly.';

-- =============================================================================
-- Transactional enqueue primitives
-- =============================================================================

CREATE FUNCTION public.enqueue_bank_connection_revocation_internal(
    p_connection_id UUID,
    p_operation TEXT,
    p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_connection bank_connections%ROWTYPE;
    v_household_id UUID;
    v_outbox bank_connection_orphaned_items%ROWTYPE;
    v_outbox_id UUID;
BEGIN
    IF p_operation NOT IN ('downgrade', 'user_disconnect', 'account_deletion') THEN
        RAISE EXCEPTION 'invalid revocation operation'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT household_id
    INTO v_household_id
    FROM bank_connections
    WHERE id = p_connection_id;

    IF NOT FOUND THEN
        SELECT id INTO v_outbox_id
        FROM bank_connection_orphaned_items
        WHERE idempotency_key = 'connection:' || p_connection_id::text
        LIMIT 1;
        RETURN v_outbox_id;
    END IF;

    PERFORM pg_advisory_xact_lock(
        bank_connection_reservation_lock_key(v_household_id)
    );

    SELECT *
    INTO v_connection
    FROM bank_connections
    WHERE id = p_connection_id
    FOR UPDATE;

    IF NOT FOUND THEN
        SELECT id INTO v_outbox_id
        FROM bank_connection_orphaned_items
        WHERE idempotency_key = 'connection:' || p_connection_id::text
        LIMIT 1;
        RETURN v_outbox_id;
    END IF;

    IF p_actor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM household_members m
        WHERE m.household_id = v_connection.household_id
          AND m.user_id = p_actor_id
          AND m.role IN ('owner', 'admin')
          AND m.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'bank connection management forbidden'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO v_outbox
    FROM bank_connection_orphaned_items
    WHERE connection_id = p_connection_id
      AND status IN (
          'pending_revocation',
          'pending_reconciliation',
          'processing',
          'exhausted'
      )
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        UPDATE bank_connection_orphaned_items
        SET operation = CASE
                WHEN p_operation = 'account_deletion' THEN 'account_deletion'
                WHEN operation = 'orphan_finalization' THEN p_operation
                ELSE operation
            END,
            idempotency_key = 'connection:' || p_connection_id::text,
            status = CASE WHEN status = 'pending_reconciliation'
                          THEN 'pending_revocation' ELSE status END,
            encrypted_access_token = COALESCE(
                encrypted_access_token,
                v_connection.encrypted_access_token
            ),
            next_attempt_at = LEAST(next_attempt_at, now()),
            last_error_code = CASE WHEN status = 'pending_reconciliation'
                                   THEN NULL ELSE last_error_code END
        WHERE id = v_outbox.id
        RETURNING id INTO v_outbox_id;
    ELSE
        IF v_connection.encrypted_access_token IS NULL THEN
            RAISE EXCEPTION 'revocation credential unavailable'
                USING ERRCODE = '23502';
        END IF;

        INSERT INTO bank_connection_orphaned_items (
            household_id,
            owner_id,
            connection_id,
            provider,
            encrypted_access_token,
            status,
            operation,
            idempotency_key,
            attempts,
            next_attempt_at,
            last_error_code
        )
        VALUES (
            v_connection.household_id,
            v_connection.owner_id,
            v_connection.id,
            v_connection.provider,
            v_connection.encrypted_access_token,
            'pending_revocation',
            p_operation,
            'connection:' || v_connection.id::text,
            0,
            now(),
            NULL
        )
        RETURNING id INTO v_outbox_id;
    END IF;

    UPDATE bank_connections
    SET status = 'revocation_pending',
        sync_enabled = false,
        sync_disabled_at = COALESCE(sync_disabled_at, now()),
        encrypted_access_token = NULL,
        error_code = NULL,
        error_message = NULL
    WHERE id = v_connection.id
      AND deleted_at IS NULL;

    RETURN v_outbox_id;
END;
$$;

CREATE FUNCTION public.enqueue_bank_connection_revocation(
    p_connection_id UUID,
    p_operation TEXT,
    p_actor_id UUID
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT enqueue_bank_connection_revocation_internal(
        p_connection_id,
        p_operation,
        p_actor_id
    );
$$;

-- Preserve Stage 6 finalization handoffs while making repeated delivery
-- idempotent on the caller-generated connection id.
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
    IF p_provider NOT IN ('plaid', 'mx') THEN
        RAISE EXCEPTION 'invalid provider' USING ERRCODE = 'check_violation';
    END IF;
    IF p_status NOT IN ('pending_revocation', 'pending_reconciliation') THEN
        RAISE EXCEPTION 'an orphan handoff must be open'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_encrypted_access_token IS NULL OR btrim(p_encrypted_access_token) = '' THEN
        RAISE EXCEPTION 'encrypted revocation credential is required'
            USING ERRCODE = 'not_null_violation';
    END IF;

    IF p_connection_id IS NOT NULL THEN
        SELECT id INTO v_id
        FROM bank_connection_orphaned_items
        WHERE connection_id = p_connection_id
          AND status IN (
              'pending_revocation',
              'pending_reconciliation',
              'processing',
              'exhausted'
          )
        ORDER BY created_at, id
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    INSERT INTO bank_connection_orphaned_items (
        household_id,
        owner_id,
        connection_id,
        provider,
        encrypted_access_token,
        status,
        operation,
        idempotency_key,
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
        'orphan_finalization',
        CASE WHEN p_connection_id IS NULL
             THEN 'orphan:' || gen_random_uuid()::text
             ELSE 'orphan-connection:' || p_connection_id::text END,
        CASE WHEN p_last_error_code IS NULL THEN 0 ELSE 1 END,
        p_last_error_code
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Keep the Stage 6 completion API valid for orphan-finalization handoffs while
-- preventing it from bypassing the leased worker for connection-backed jobs.
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
        completed_at = now(),
        attempts = LEAST(attempts + 1, max_attempts),
        last_error_code = COALESCE(p_last_error_code, last_error_code)
    WHERE id = p_id
      AND operation = 'orphan_finalization'
      AND status IN ('pending_revocation', 'pending_reconciliation');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

-- =============================================================================
-- Authenticated retention selection and projection-driven fallback
-- =============================================================================

CREATE TABLE bank_connection_retention_selections (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id             UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    actor_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_projection_version BIGINT NOT NULL,
    source_tier              TEXT NOT NULL,
    source_allowance         BIGINT NOT NULL,
    target_tier              TEXT NOT NULL,
    target_allowance         BIGINT NOT NULL,
    retained_connection_ids  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    status                   TEXT NOT NULL DEFAULT 'pending',
    applied_mode             TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until              TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    consumed_at              TIMESTAMPTZ,

    CONSTRAINT bank_connection_retention_source_tier_check
        CHECK (source_tier IN ('premium', 'family')),
    CONSTRAINT bank_connection_retention_target_tier_check
        CHECK (target_tier IN ('free', 'plus', 'premium')),
    CONSTRAINT bank_connection_retention_allowance_check CHECK (
        source_allowance > target_allowance
        AND (
            (source_tier = 'family' AND target_tier = 'premium' AND target_allowance = 2)
            OR (
                source_tier = 'premium'
                AND target_tier IN ('free', 'plus')
                AND target_allowance = 0
            )
        )
    ),
    CONSTRAINT bank_connection_retention_status_check
        CHECK (status IN ('pending', 'applied', 'superseded', 'expired')),
    CONSTRAINT bank_connection_retention_mode_check CHECK (
        (status = 'applied' AND applied_mode IN ('explicit', 'fallback'))
        OR (status <> 'applied' AND applied_mode IS NULL)
    ),
    CONSTRAINT bank_connection_retention_window_check CHECK (valid_until > created_at)
);

CREATE INDEX idx_bank_connection_retention_pending
    ON bank_connection_retention_selections (household_id, created_at DESC)
    WHERE status = 'pending';

ALTER TABLE bank_connection_retention_selections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bank_connection_retention_selections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_connection_retention_selections
    TO service_role;

CREATE FUNCTION public.prepare_bank_connection_downgrade(
    p_household_id UUID,
    p_actor_id UUID,
    p_target_tier TEXT,
    p_retained_connection_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (selection_id UUID, retained_count INTEGER, target_allowance BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_projection current_household_entitlements%ROWTYPE;
    v_target_allowance BIGINT;
    v_ids UUID[] := COALESCE(p_retained_connection_ids, ARRAY[]::UUID[]);
    v_live_count INTEGER;
    v_required_count INTEGER;
    v_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    IF NOT EXISTS (
        SELECT 1
        FROM household_members m
        WHERE m.household_id = p_household_id
          AND m.user_id = p_actor_id
          AND m.role IN ('owner', 'admin')
          AND m.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'bank connection management forbidden'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_projection
    FROM current_household_entitlements
    WHERE household_id = p_household_id
    FOR UPDATE;

    IF NOT FOUND OR v_projection.expires_at IS NULL
       OR v_projection.expires_at <= statement_timestamp() THEN
        RAISE EXCEPTION 'current entitlement projection unavailable'
            USING ERRCODE = '55000';
    END IF;

    IF v_projection.display_tier = 'family' AND p_target_tier = 'premium' THEN
        v_target_allowance := 2;
    ELSIF v_projection.display_tier = 'premium'
          AND p_target_tier IN ('free', 'plus') THEN
        v_target_allowance := 0;
    ELSE
        RAISE EXCEPTION 'transition does not reduce the connection allowance'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)::INTEGER INTO v_live_count
    FROM bank_connections c
    WHERE c.household_id = p_household_id
      AND c.deleted_at IS NULL
      AND c.sync_enabled
      AND c.status IN ('active', 'needs_reauth', 'error');

    v_required_count := LEAST(v_live_count, v_target_allowance::INTEGER);

    IF cardinality(v_ids) <> (
        SELECT count(DISTINCT candidate)
        FROM unnest(v_ids) AS candidate
    ) THEN
        RAISE EXCEPTION 'retained connection selection contains duplicates'
            USING ERRCODE = '22023';
    END IF;

    IF cardinality(v_ids) <> v_required_count THEN
        RAISE EXCEPTION 'retained connection selection has the wrong size'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(v_ids) selected(id)
        LEFT JOIN bank_connections c
          ON c.id = selected.id
         AND c.household_id = p_household_id
         AND c.deleted_at IS NULL
         AND c.sync_enabled
         AND c.status IN ('active', 'needs_reauth', 'error')
        WHERE c.id IS NULL
    ) THEN
        RAISE EXCEPTION 'retained connection selection is not live in this household'
            USING ERRCODE = '22023';
    END IF;

    UPDATE bank_connection_retention_selections
    SET status = 'superseded'
    WHERE household_id = p_household_id
      AND status = 'pending';

    INSERT INTO bank_connection_retention_selections (
        household_id,
        actor_id,
        source_projection_version,
        source_tier,
        source_allowance,
        target_tier,
        target_allowance,
        retained_connection_ids
    )
    VALUES (
        p_household_id,
        p_actor_id,
        v_projection.projection_version,
        v_projection.display_tier,
        v_projection.bank_connection_allowance,
        p_target_tier,
        v_target_allowance,
        v_ids
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, cardinality(v_ids), v_target_allowance;
END;
$$;

CREATE FUNCTION public.apply_bank_connection_cap_reduction_internal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_selection bank_connection_retention_selections%ROWTYPE;
    v_retained UUID[] := ARRAY[]::UUID[];
    v_required_count INTEGER;
    v_selection_valid BOOLEAN := false;
    v_has_selection BOOLEAN := false;
    v_connection RECORD;
BEGIN
    IF TG_OP <> 'UPDATE'
       OR NEW.bank_connection_allowance >= OLD.bank_connection_allowance THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(
        bank_connection_reservation_lock_key(NEW.household_id)
    );

    SELECT * INTO v_selection
    FROM bank_connection_retention_selections s
    WHERE s.household_id = NEW.household_id
      AND s.status = 'pending'
      AND s.valid_until > statement_timestamp()
      AND s.source_projection_version = OLD.projection_version
      AND s.source_tier = OLD.display_tier
      AND s.source_allowance = OLD.bank_connection_allowance
      AND s.target_allowance = NEW.bank_connection_allowance
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT 1
    FOR UPDATE;
    v_has_selection := FOUND;

    SELECT LEAST(count(*)::INTEGER, NEW.bank_connection_allowance::INTEGER)
    INTO v_required_count
    FROM bank_connections c
    WHERE c.household_id = NEW.household_id
      AND c.deleted_at IS NULL
      AND c.sync_enabled
      AND c.status IN ('active', 'needs_reauth', 'error');

    IF v_has_selection THEN
        v_selection_valid :=
            cardinality(v_selection.retained_connection_ids) = v_required_count
            AND NOT EXISTS (
                SELECT 1
                FROM unnest(v_selection.retained_connection_ids) selected(id)
                LEFT JOIN bank_connections c
                  ON c.id = selected.id
                 AND c.household_id = NEW.household_id
                 AND c.deleted_at IS NULL
                 AND c.sync_enabled
                 AND c.status IN ('active', 'needs_reauth', 'error')
                WHERE c.id IS NULL
            );
    END IF;

    IF v_selection_valid THEN
        v_retained := v_selection.retained_connection_ids;
    ELSE
        SELECT COALESCE(array_agg(id ORDER BY created_at, id), ARRAY[]::UUID[])
        INTO v_retained
        FROM (
            SELECT c.id, c.created_at
            FROM bank_connections c
            WHERE c.household_id = NEW.household_id
              AND c.deleted_at IS NULL
              AND c.sync_enabled
              AND c.status IN ('active', 'needs_reauth', 'error')
            ORDER BY c.created_at, c.id
            LIMIT NEW.bank_connection_allowance
        ) oldest;
    END IF;

    FOR v_connection IN
        SELECT c.id
        FROM bank_connections c
        WHERE c.household_id = NEW.household_id
          AND c.deleted_at IS NULL
          AND c.sync_enabled
          AND c.status IN ('active', 'needs_reauth', 'error')
          AND NOT (c.id = ANY(v_retained))
        ORDER BY c.created_at, c.id
    LOOP
        PERFORM enqueue_bank_connection_revocation_internal(
            v_connection.id,
            'downgrade',
            NULL
        );
    END LOOP;

    UPDATE bank_connection_retention_selections
    SET status = CASE WHEN id = v_selection.id THEN 'applied' ELSE 'expired' END,
        applied_mode = CASE
            WHEN id = v_selection.id
            THEN CASE WHEN v_selection_valid THEN 'explicit' ELSE 'fallback' END
            ELSE NULL
        END,
        consumed_at = CASE WHEN id = v_selection.id THEN now() ELSE consumed_at END
    WHERE household_id = NEW.household_id
      AND status = 'pending';

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_current_household_entitlements_bank_cap_reduction
    AFTER UPDATE OF bank_connection_allowance
    ON current_household_entitlements
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_bank_connection_cap_reduction_internal();

-- =============================================================================
-- Account-erasure handoff: durable first, identity severed in the same RPC
-- =============================================================================

CREATE FUNCTION public.prepare_bank_connection_erasure(
    p_owner_id UUID,
    p_household_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_connection RECORD;
    v_household RECORD;
    v_count INTEGER := 0;
BEGIN
    -- Every connection mutation follows advisory-lock then row-lock order.
    -- Lock all affected households deterministically so concurrent downgrade,
    -- disconnect, and account-erasure transactions cannot deadlock or admit a
    -- connection after this transaction takes its snapshot.
    FOR v_household IN
        SELECT DISTINCT c.household_id
        FROM bank_connections c
        WHERE c.deleted_at IS NULL
          AND (
              c.owner_id = p_owner_id
              OR (
                  p_household_ids IS NOT NULL
                  AND c.household_id = ANY(p_household_ids)
              )
          )
        ORDER BY c.household_id
    LOOP
        PERFORM pg_advisory_xact_lock(
            bank_connection_reservation_lock_key(v_household.household_id)
        );
    END LOOP;

    FOR v_connection IN
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
          ORDER BY c.household_id, c.created_at, c.id
    LOOP
        PERFORM enqueue_bank_connection_revocation_internal(
            v_connection.id,
            'account_deletion',
            NULL
        );
        v_count := v_count + 1;
    END LOOP;

    UPDATE bank_connection_orphaned_items o
    SET operation = 'account_deletion',
        status = CASE WHEN status = 'pending_reconciliation'
                      THEN 'pending_revocation' ELSE status END,
        owner_id = NULL,
        household_id = NULL,
        erasure_requested_at = COALESCE(erasure_requested_at, now()),
        retain_until = LEAST(retain_until, now() + interval '7 days'),
        next_attempt_at = LEAST(next_attempt_at, now()),
        last_error_code = CASE WHEN status = 'pending_reconciliation'
                               THEN NULL ELSE last_error_code END
    WHERE status IN (
        'pending_revocation',
        'pending_reconciliation',
        'processing',
        'exhausted'
    )
      AND (
          o.owner_id = p_owner_id
          OR (
              p_household_ids IS NOT NULL
              AND o.household_id = ANY(p_household_ids)
          )
      );

    RETURN v_count;
END;
$$;

-- =============================================================================
-- Worker claim, completion, failure, reconciliation, and alert summary
-- =============================================================================

CREATE FUNCTION public.claim_bank_connection_revocations(
    p_limit INTEGER DEFAULT 25,
    p_lease INTERVAL DEFAULT interval '5 minutes'
)
RETURNS TABLE (
    id UUID,
    provider TEXT,
    encrypted_access_token TEXT,
    claim_token UUID,
    attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'claim limit must be between 1 and 100'
            USING ERRCODE = '22023';
    END IF;
    IF p_lease < interval '30 seconds' OR p_lease > interval '30 minutes' THEN
        RAISE EXCEPTION 'claim lease is outside the allowed range'
            USING ERRCODE = '22023';
    END IF;

    -- A lost worker process cannot strand a row in processing forever.
    UPDATE bank_connection_orphaned_items o
    SET status = 'pending_revocation',
        claim_token = NULL,
        claim_expires_at = NULL,
        next_attempt_at = now(),
        last_error_code = 'WORKER_LEASE_EXPIRED'
    WHERE o.status = 'processing'
      AND o.claim_expires_at <= now()
      AND o.retain_until > now();

    -- Unknown finalization is reconciled before any provider call. A still-live,
    -- sync-enabled connection proves the Item is retained; absent, deleted, or
    -- disabled state makes provider revocation safe.
    UPDATE bank_connection_orphaned_items o
    SET status = CASE
            WHEN c.id IS NOT NULL
             AND c.deleted_at IS NULL
             AND c.sync_enabled
             AND c.status IN ('active', 'needs_reauth', 'error')
            THEN 'retained'
            ELSE 'pending_revocation'
        END,
        encrypted_access_token = CASE
            WHEN c.id IS NOT NULL
             AND c.deleted_at IS NULL
             AND c.sync_enabled
             AND c.status IN ('active', 'needs_reauth', 'error')
            THEN NULL
            ELSE o.encrypted_access_token
        END,
        revoked_at = CASE
            WHEN c.id IS NOT NULL
             AND c.deleted_at IS NULL
             AND c.sync_enabled
             AND c.status IN ('active', 'needs_reauth', 'error')
            THEN now()
            ELSE NULL
        END,
        completed_at = CASE
            WHEN c.id IS NOT NULL
             AND c.deleted_at IS NULL
             AND c.sync_enabled
             AND c.status IN ('active', 'needs_reauth', 'error')
            THEN now()
            ELSE NULL
        END,
        next_attempt_at = CASE
            WHEN c.id IS NOT NULL
             AND c.deleted_at IS NULL
             AND c.sync_enabled
             AND c.status IN ('active', 'needs_reauth', 'error')
            THEN o.next_attempt_at
            ELSE LEAST(o.next_attempt_at, now())
        END,
        last_error_code = NULL
    FROM (
        SELECT candidate.id, candidate.connection_id
        FROM bank_connection_orphaned_items candidate
        WHERE candidate.status = 'pending_reconciliation'
        ORDER BY candidate.created_at, candidate.id
        FOR UPDATE SKIP LOCKED
    ) candidates
    LEFT JOIN bank_connections c ON c.id = candidates.connection_id
    WHERE o.id = candidates.id;

    RETURN QUERY
    WITH candidates AS (
        SELECT o.id
        FROM bank_connection_orphaned_items o
        WHERE o.status = 'pending_revocation'
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
            attempts = attempts + 1,
            last_attempt_at = now(),
            claim_token = gen_random_uuid(),
            claim_expires_at = now() + p_lease
        FROM candidates
        WHERE o.id = candidates.id
        RETURNING
            o.id,
            o.provider,
            o.encrypted_access_token,
            o.claim_token,
            o.attempts
    )
    SELECT * FROM claimed;
END;
$$;

CREATE FUNCTION public.complete_bank_connection_revocation(
    p_id UUID,
    p_claim_token UUID,
    p_outcome TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row bank_connection_orphaned_items%ROWTYPE;
BEGIN
    IF p_outcome NOT IN ('revoked', 'already_invalid') THEN
        RAISE EXCEPTION 'invalid successful revocation outcome'
            USING ERRCODE = '22023';
    END IF;

    UPDATE bank_connection_orphaned_items
    SET status = p_outcome,
        encrypted_access_token = NULL,
        claim_token = NULL,
        claim_expires_at = NULL,
        revoked_at = now(),
        completed_at = now(),
        next_attempt_at = now(),
        last_error_code = NULL
    WHERE bank_connection_orphaned_items.id = p_id
      AND status = 'processing'
      AND claim_token = p_claim_token
      AND claim_expires_at > now()
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RETURN EXISTS (
            SELECT 1
            FROM bank_connection_orphaned_items
            WHERE id = p_id
              AND status IN ('revoked', 'already_invalid')
        );
    END IF;

    IF v_row.connection_id IS NOT NULL
       AND v_row.operation <> 'account_deletion' THEN
        UPDATE bank_connections
        SET status = 'disconnected',
            deleted_at = COALESCE(deleted_at, now()),
            sync_enabled = false,
            sync_disabled_at = COALESCE(sync_disabled_at, now()),
            encrypted_access_token = NULL
        WHERE id = v_row.connection_id
          AND status = 'revocation_pending';
    END IF;

    RETURN true;
END;
$$;

CREATE FUNCTION public.fail_bank_connection_revocation(
    p_id UUID,
    p_claim_token UUID,
    p_error_code TEXT
)
RETURNS TABLE (status TEXT, next_attempt_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row bank_connection_orphaned_items%ROWTYPE;
    v_base_seconds DOUBLE PRECISION;
    v_delay INTERVAL;
BEGIN
    IF p_error_code IS NULL
       OR p_error_code !~ '^[A-Z0-9_:-]{1,96}$' THEN
        RAISE EXCEPTION 'invalid safe error code'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_row
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND status = 'processing'
      AND claim_token = p_claim_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_row.attempts >= v_row.max_attempts THEN
        UPDATE bank_connection_orphaned_items
        SET status = 'exhausted',
            claim_token = NULL,
            claim_expires_at = NULL,
            last_error_code = p_error_code
        WHERE id = p_id
        RETURNING bank_connection_orphaned_items.status,
                  bank_connection_orphaned_items.next_attempt_at
        INTO status, next_attempt_at;
    ELSE
        v_base_seconds := LEAST(
            21600::DOUBLE PRECISION,
            30::DOUBLE PRECISION * power(2, LEAST(v_row.attempts - 1, 10))
        );
        v_delay := make_interval(
            secs => v_base_seconds + (random() * v_base_seconds * 0.25)
        );

        UPDATE bank_connection_orphaned_items
        SET status = 'pending_revocation',
            claim_token = NULL,
            claim_expires_at = NULL,
            next_attempt_at = now() + v_delay,
            last_error_code = p_error_code
        WHERE id = p_id
        RETURNING bank_connection_orphaned_items.status,
                  bank_connection_orphaned_items.next_attempt_at
        INTO status, next_attempt_at;
    END IF;

    RETURN NEXT;
END;
$$;

CREATE FUNCTION public.bank_connection_revocation_status()
RETURNS TABLE (
    provider TEXT,
    status TEXT,
    item_count BIGINT,
    due_count BIGINT,
    oldest_created_at TIMESTAMPTZ,
    nearest_retention_ceiling TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        o.provider,
        o.status,
        count(*),
        count(*) FILTER (
            WHERE o.status = 'pending_revocation'
              AND o.next_attempt_at <= now()
        ),
        min(o.created_at),
        min(o.retain_until) FILTER (
            WHERE o.encrypted_access_token IS NOT NULL
        )
    FROM bank_connection_orphaned_items o
    GROUP BY o.provider, o.status
    ORDER BY o.provider, o.status;
$$;

-- Exhausted work is intentionally not claimed again, but its credential stays
-- only until the existing hard retention ceiling. Extend the Stage 6 purge to
-- cover every credential-bearing worker state.
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
    DELETE FROM bank_connection_retention_selections
    WHERE valid_until <= now() - interval '30 days';

    WITH expired AS (
        UPDATE bank_connection_orphaned_items
        SET status = 'abandoned',
            encrypted_access_token = NULL,
            claim_token = NULL,
            claim_expires_at = NULL,
            revoked_at = now(),
            completed_at = now(),
            last_error_code = COALESCE(last_error_code, 'RETENTION_EXPIRED')
        WHERE status IN (
            'pending_revocation',
            'pending_reconciliation',
            'processing',
            'exhausted'
        )
          AND retain_until <= now()
        RETURNING 1
    )
    SELECT count(*) INTO v_abandoned FROM expired;

    WITH purged AS (
        DELETE FROM bank_connection_orphaned_items
        WHERE status IN ('revoked', 'already_invalid', 'retained', 'abandoned')
          AND completed_at <= now() - COALESCE(
              p_terminal_retention,
              interval '90 days'
          )
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM purged;

    RETURN QUERY SELECT v_abandoned, v_deleted;
END;
$$;

-- =============================================================================
-- Least privilege
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation_internal(
    UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation(
    UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_bank_connection_downgrade(
    UUID, UUID, TEXT, UUID[]
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_bank_connection_cap_reduction_internal()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_bank_connection_erasure(UUID, UUID[])
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_bank_connection_revocations(INTEGER, INTERVAL)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_bank_connection_revocation(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_bank_connection_revocation(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bank_connection_revocation_status()
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation(UUID, TEXT, UUID)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_bank_connection_downgrade(
    UUID, UUID, TEXT, UUID[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_bank_connection_erasure(UUID, UUID[])
    TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_bank_connection_revocations(INTEGER, INTERVAL)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_bank_connection_revocation(UUID, UUID, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_bank_connection_revocation(UUID, UUID, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.bank_connection_revocation_status()
    TO service_role;

COMMENT ON FUNCTION public.prepare_bank_connection_downgrade(UUID, UUID, TEXT, UUID[]) IS
    'Validates an owner/admin retention selection against the current live '
    'server entitlement subject and live connections. Invalid selections fail; '
    'a missing/expired selection at projection reduction uses oldest-created '
    'then UUID fallback (#4405).';
COMMENT ON FUNCTION public.claim_bank_connection_revocations(INTEGER, INTERVAL) IS
    'Claims due provider revocations with FOR UPDATE SKIP LOCKED and a bounded '
    'lease. Reconciles ambiguous Stage 6 finalization before any revoke.';
COMMENT ON FUNCTION public.fail_bank_connection_revocation(UUID, UUID, TEXT) IS
    'Records a secret-safe failure and schedules bounded exponential backoff '
    'with up to 25 percent jitter. Exhausted credentials remain only until the '
    'hard retention ceiling.';
