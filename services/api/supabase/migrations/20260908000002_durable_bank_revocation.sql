-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Migration: 20260908000002_durable_bank_revocation
-- Description: Durable downgrade and provider revocation recovery (#4405)
-- =============================================================================
-- Extends the Stage 6 `bank_connection_orphaned_items` handoff into the single
-- server-only revocation outbox. A credential is moved into this table before
-- a live connection is disabled, and is destroyed only after the provider
-- confirms revocation/already-invalid or the bounded retention ceiling expires.
--
-- The outbox is deliberately excluded from PowerSync, exports, public APIs,
-- logs, analytics, and crash payloads. Only service_role can read or mutate it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Live connection state: disable sync before any provider-side retry.
-- -----------------------------------------------------------------------------

ALTER TABLE bank_connections
    DROP CONSTRAINT bank_connections_status_valid;

ALTER TABLE bank_connections
    ADD CONSTRAINT bank_connections_status_valid
        CHECK (status IN (
            'active',
            'needs_reauth',
            'revocation_pending',
            'disconnected',
            'error'
        )),
    ALTER COLUMN encrypted_access_token DROP NOT NULL,
    ADD COLUMN sync_disabled_at TIMESTAMPTZ;

ALTER TABLE bank_connections
    ADD CONSTRAINT bank_connections_revocation_pending_check CHECK (
        status <> 'revocation_pending'
        OR (
            deleted_at IS NULL
            AND sync_disabled_at IS NOT NULL
            AND encrypted_access_token IS NULL
        )
    ),
    ADD CONSTRAINT bank_connections_live_credential_check CHECK (
        deleted_at IS NOT NULL
        OR status NOT IN ('active', 'needs_reauth', 'error')
        OR encrypted_access_token IS NOT NULL
    );

COMMENT ON COLUMN bank_connections.sync_disabled_at IS
    'Server time at which provider synchronization was disabled. Set before a '
    'durable revocation retry is exposed to a worker; historical Finance data '
    'remains available while provider sync is disabled (#4405).';

-- -----------------------------------------------------------------------------
-- 2. Unify the Stage 6 handoff into one bounded, idempotent durable outbox.
-- -----------------------------------------------------------------------------

ALTER TABLE bank_connection_orphaned_items
    ADD COLUMN operation_reason TEXT NOT NULL DEFAULT 'finalization_rejected',
    ADD COLUMN idempotency_key TEXT,
    ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN claimed_at TIMESTAMPTZ,
    ADD COLUMN claim_expires_at TIMESTAMPTZ,
    ADD COLUMN claim_token UUID,
    ADD COLUMN last_attempt_at TIMESTAMPTZ,
    ADD COLUMN max_attempts SMALLINT NOT NULL DEFAULT 8,
    ADD COLUMN completion_recovery_attempts SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN max_completion_recovery_attempts SMALLINT NOT NULL DEFAULT 3,
    ADD COLUMN exhausted_at TIMESTAMPTZ,
    ADD COLUMN reconciliation_required BOOLEAN NOT NULL DEFAULT false;

UPDATE bank_connection_orphaned_items
SET operation_reason = CASE
        WHEN status = 'pending_reconciliation' THEN 'finalization_reconciliation'
        ELSE 'finalization_rejected'
    END,
    idempotency_key = CASE
        WHEN connection_id IS NOT NULL THEN 'connection:' || connection_id::TEXT
        ELSE 'orphan:' || id::TEXT
    END,
    available_at = CASE
        WHEN status = 'pending_reconciliation'
            THEN GREATEST(now(), created_at + interval '15 minutes')
        ELSE now()
    END,
    reconciliation_required = (status = 'pending_reconciliation');

ALTER TABLE bank_connection_orphaned_items
    ALTER COLUMN idempotency_key SET NOT NULL,
    ALTER COLUMN idempotency_key SET DEFAULT ('orphan:' || gen_random_uuid()::TEXT),
    ADD CONSTRAINT bank_connection_revocation_reason_valid CHECK (
        operation_reason IN (
            'downgrade',
            'user_disconnect',
            'account_deletion',
            'finalization_rejected',
            'finalization_reconciliation'
        )
    ),
    ADD CONSTRAINT bank_connection_revocation_attempt_limit CHECK (
        attempts >= 0
        AND max_attempts BETWEEN 1 AND 32
        AND completion_recovery_attempts >= 0
        AND max_completion_recovery_attempts BETWEEN 1 AND 8
        AND completion_recovery_attempts <= max_completion_recovery_attempts
    );

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT bank_connection_orphaned_items_status_valid,
    DROP CONSTRAINT bank_connection_orphaned_items_terminal_check;

ALTER TABLE bank_connection_orphaned_items
    ADD CONSTRAINT bank_connection_orphaned_items_status_valid CHECK (
        status IN (
            'pending_revocation',
            'pending_reconciliation',
            'retry_wait',
            'processing',
            'exhausted',
            'revoked',
            'reconciled',
            'abandoned'
        )
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_terminal_check CHECK (
        (
            status IN (
                'pending_revocation',
                'pending_reconciliation',
                'retry_wait',
                'processing',
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
    ),
    ADD CONSTRAINT bank_connection_revocation_claim_check CHECK (
        (
            status = 'processing'
            AND claimed_at IS NOT NULL
            AND claim_expires_at IS NOT NULL
            AND claim_token IS NOT NULL
        )
        OR (
            status <> 'processing'
            AND claimed_at IS NULL
            AND claim_expires_at IS NULL
            AND claim_token IS NULL
        )
    ),
    ADD CONSTRAINT bank_connection_revocation_exhaustion_check CHECK (
        (status = 'exhausted' AND exhausted_at IS NOT NULL)
        OR (status <> 'exhausted' AND exhausted_at IS NULL)
    );

-- Stage 6 could record the same caller-generated connection id more than once.
-- Keep the oldest open handoff canonical, and disposition duplicates without
-- retaining another credential. Terminal historical rows use row-scoped keys.
WITH ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY connection_id
            ORDER BY
                CASE status WHEN 'pending_reconciliation' THEN 0 ELSE 1 END,
                created_at,
                id
        ) AS position
    FROM bank_connection_orphaned_items
    WHERE connection_id IS NOT NULL
      AND status IN ('pending_revocation', 'pending_reconciliation')
)
UPDATE bank_connection_orphaned_items o
SET status = 'abandoned',
    encrypted_access_token = NULL,
    revoked_at = now(),
    last_error_code = 'DUPLICATE_HANDOFF',
    idempotency_key = 'duplicate:' || o.id::TEXT,
    claimed_at = NULL,
    claim_expires_at = NULL,
    claim_token = NULL,
    exhausted_at = NULL,
    reconciliation_required = false
FROM ranked r
WHERE o.id = r.id
  AND r.position > 1;

UPDATE bank_connection_orphaned_items
SET idempotency_key = status || ':' || id::TEXT
WHERE status IN ('revoked', 'abandoned');

UPDATE bank_connection_orphaned_items
SET max_attempts = LEAST(32, GREATEST(8, attempts + 8))
WHERE status IN ('pending_revocation', 'pending_reconciliation');

UPDATE bank_connection_orphaned_items
SET status = 'exhausted',
    exhausted_at = now(),
    available_at = retain_until,
    last_error_code = COALESCE(last_error_code, 'PREVIOUS_ATTEMPTS_EXHAUSTED')
WHERE status IN ('pending_revocation', 'pending_reconciliation')
  AND attempts >= max_attempts;

CREATE UNIQUE INDEX idx_bank_connection_revocation_idempotency
    ON bank_connection_orphaned_items (idempotency_key);
CREATE UNIQUE INDEX idx_bank_connection_revocation_open_connection
    ON bank_connection_orphaned_items (connection_id)
    WHERE connection_id IS NOT NULL
      AND status IN (
          'pending_revocation',
          'pending_reconciliation',
          'retry_wait',
          'processing',
          'exhausted'
      );
CREATE INDEX idx_bank_connection_revocation_claim
    ON bank_connection_orphaned_items (available_at, created_at, id)
    WHERE status IN (
        'pending_revocation',
        'pending_reconciliation',
        'retry_wait',
        'processing'
    );
CREATE INDEX idx_bank_connection_revocation_exhausted
    ON bank_connection_orphaned_items (exhausted_at)
    WHERE status = 'exhausted';

COMMENT ON TABLE bank_connection_orphaned_items IS
    'The single minimized, encrypted, server-only provider-revocation outbox '
    '(#4405), unified with the Stage 6 orphan/finalization-reconciliation '
    'handoff. Credentials never enter PowerSync, exports, public APIs, logs, '
    'analytics, or crash payloads. Open and exhausted rows retain only the '
    'encrypted credential needed for retry and only until retain_until.';
COMMENT ON COLUMN bank_connection_orphaned_items.idempotency_key IS
    'Stable server-generated key preventing duplicate durable work for one '
    'connection. It contains no provider identifier or credential.';
COMMENT ON COLUMN bank_connection_orphaned_items.available_at IS
    'Earliest claim time after bounded exponential backoff with deterministic '
    'jitter. It contains no provider or financial data.';
COMMENT ON COLUMN bank_connection_orphaned_items.exhausted_at IS
    'When automatic retries were exhausted. The encrypted credential remains '
    'available only to the service-role reconciliation path until retain_until.';

-- Normalize every future Stage 6 handoff without changing its public call
-- shape. A reconciliation handoff waits for in-flight finalization to settle.
CREATE FUNCTION public.prepare_bank_revocation_outbox_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.connection_id IS NOT NULL THEN
        NEW.idempotency_key := 'connection:' || NEW.connection_id::TEXT;
    ELSIF NEW.idempotency_key IS NULL OR btrim(NEW.idempotency_key) = '' THEN
        NEW.idempotency_key := 'orphan:' || NEW.id::TEXT;
    END IF;

    IF NEW.status = 'pending_reconciliation' THEN
        NEW.operation_reason := 'finalization_reconciliation';
        NEW.reconciliation_required := true;
        NEW.available_at := GREATEST(
            COALESCE(NEW.available_at, now()),
            now() + interval '15 minutes'
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prepare_bank_revocation_outbox_row
    BEFORE INSERT ON bank_connection_orphaned_items
    FOR EACH ROW EXECUTE FUNCTION public.prepare_bank_revocation_outbox_row();

-- Preserve the Stage 6 call shape while making response-loss replay idempotent.
-- The insert trigger derives the stable connection-scoped key.
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
    ON CONFLICT (idempotency_key) DO UPDATE
    SET idempotency_key = EXCLUDED.idempotency_key
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_orphaned_bank_item(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
) IS
    'Idempotently records the Stage 6 orphan/reconciliation handoff in the '
    'unified Stage 7 revocation outbox (#4405). A replay for the same '
    'caller-generated connection id returns the existing durable row.';

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
        last_error_code = COALESCE(p_last_error_code, last_error_code),
        status = CASE
            WHEN attempts + 1 >= max_attempts THEN 'exhausted'
            ELSE status
        END,
        exhausted_at = CASE
            WHEN attempts + 1 >= max_attempts THEN now()
            ELSE exhausted_at
        END,
        available_at = CASE
            WHEN attempts + 1 >= max_attempts THEN retain_until
            ELSE available_at
        END
    WHERE id = p_id
      AND status IN ('pending_revocation', 'pending_reconciliation');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

CREATE FUNCTION public.finalize_or_enqueue_bank_connection(
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
    status TEXT,
    connection_id UUID,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result RECORD;
    v_handoff_id UUID;
    v_handoff_household_id UUID;
    v_handoff_owner_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(
        bank_connection_reservation_lock_key(p_household_id)
    );

    IF EXISTS (
        SELECT 1
        FROM bank_connection_erasure_barriers
        WHERE owner_fingerprint = bank_connection_owner_fingerprint(p_owner_id)
          AND expires_at > now()
    ) THEN
        DELETE FROM bank_connection_reservations
        WHERE id = p_reservation_id
          AND household_id = p_household_id;

        SELECT p_household_id INTO v_handoff_household_id
        WHERE EXISTS (
            SELECT 1 FROM households WHERE id = p_household_id
        );
        SELECT p_owner_id INTO v_handoff_owner_id
        WHERE EXISTS (
            SELECT 1 FROM auth.users WHERE id = p_owner_id
        );

        v_handoff_id := record_orphaned_bank_item(
            v_handoff_household_id,
            v_handoff_owner_id,
            p_provider,
            p_encrypted_access_token,
            'ACCOUNT_DELETION_IN_PROGRESS',
            'pending_revocation',
            p_connection_id
        );
        UPDATE bank_connection_orphaned_items
        SET operation_reason = 'account_deletion',
            erasure_requested_at = COALESCE(erasure_requested_at, now()),
            retain_until = LEAST(retain_until, now() + interval '7 days')
        WHERE id = v_handoff_id;

        RETURN QUERY SELECT
            'account_deleting'::TEXT,
            NULL::UUID,
            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT * INTO v_result
    FROM finalize_bank_connection_reservation(
        p_reservation_id,
        p_household_id,
        p_owner_id,
        p_provider,
        p_institution_id,
        p_institution_name,
        p_encrypted_access_token,
        p_metadata,
        p_connection_id
    );

    IF v_result.status IN ('premium_required', 'at_cap', 'reservation_not_found') THEN
        PERFORM record_orphaned_bank_item(
            p_household_id,
            p_owner_id,
            p_provider,
            p_encrypted_access_token,
            'FINALIZE_' || upper(v_result.status),
            'pending_revocation',
            p_connection_id
        );
    END IF;

    RETURN QUERY SELECT
        v_result.status::TEXT,
        v_result.connection_id::UUID,
        v_result.created_at::TIMESTAMPTZ;
END;
$$;

COMMENT ON FUNCTION public.finalize_or_enqueue_bank_connection(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID
) IS
    'Atomically finalizes a provider Item or durably enqueues a definite '
    'rejection before returning it (#4405). A lost response can therefore '
    'never separate a database rejection from its encrypted retry handoff.';

-- -----------------------------------------------------------------------------
-- 3. Authenticated retained-connection selection, validated again at use time.
-- -----------------------------------------------------------------------------

CREATE TABLE bank_connection_retention_selections (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id             UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    selected_by              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    target_allowance         BIGINT      NOT NULL CHECK (target_allowance >= 0),
    retained_connection_ids  UUID[]      NOT NULL DEFAULT ARRAY[]::UUID[],
    source_allowance         BIGINT      NOT NULL CHECK (source_allowance > target_allowance),
    source_projection_version BIGINT     NOT NULL CHECK (source_projection_version > 0),
    expires_at               TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT bank_connection_retention_selection_unique
        UNIQUE (household_id, target_allowance)
);

ALTER TABLE bank_connection_retention_selections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bank_connection_retention_selections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_connection_retention_selections TO service_role;

CREATE TRIGGER trg_bank_connection_retention_selections_updated_at
    BEFORE UPDATE ON bank_connection_retention_selections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE bank_connection_retention_selections IS
    'Short-lived server-only retention choices for a cap-reducing downgrade '
    '(#4405). The server validates the authenticated household manager, target '
    'reduction, current live rows, duplicates, and cardinality both when saved '
    'and when consumed. No provider identifier or credential is stored.';

CREATE TABLE bank_connection_erasure_barriers (
    owner_fingerprint TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bank_connection_erasure_barriers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bank_connection_erasure_barriers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_connection_erasure_barriers TO service_role;

CREATE TRIGGER trg_bank_connection_erasure_barriers_updated_at
    BEFORE UPDATE ON bank_connection_erasure_barriers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE bank_connection_erasure_barriers IS
    'Short-lived server-only barrier preventing a deleting authenticated owner '
    'from reserving or finalizing another provider Item (#4405). Stores only a '
    'SHA-256 fingerprint of the random user UUID, never an identity FK, and is '
    'purged after 24 hours.';

CREATE FUNCTION public.bank_connection_owner_fingerprint(p_owner_id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT encode(
        extensions.digest('bank-revocation:' || p_owner_id::TEXT, 'sha256'),
        'hex'
    );
$$;

CREATE FUNCTION public.enforce_bank_connection_erasure_barrier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM bank_connection_erasure_barriers
        WHERE owner_fingerprint = bank_connection_owner_fingerprint(NEW.owner_id)
          AND expires_at > now()
    ) THEN
        RAISE EXCEPTION 'bank connection owner is being deleted'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bank_connection_reservation_erasure_barrier
    BEFORE INSERT ON bank_connection_reservations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_bank_connection_erasure_barrier();

CREATE FUNCTION public.prepare_bank_connection_retention_selection(
    p_household_id UUID,
    p_actor_id UUID,
    p_target_allowance BIGINT,
    p_retained_connection_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_allowance BIGINT;
    v_projection_version BIGINT;
    v_projection_expires TIMESTAMPTZ;
    v_ids UUID[] := COALESCE(p_retained_connection_ids, ARRAY[]::UUID[]);
    v_distinct_count BIGINT;
    v_live_count BIGINT;
    v_selection_expiry TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM household_members
        WHERE household_id = p_household_id
          AND user_id = p_actor_id
          AND role IN ('owner', 'admin')
          AND deleted_at IS NULL
    ) THEN
        RETURN 'forbidden';
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    SELECT
        bank_connection_cap_for_household(p_household_id),
        projection_version,
        expires_at
    INTO v_current_allowance, v_projection_version, v_projection_expires
    FROM current_household_entitlements
    WHERE household_id = p_household_id;

    IF NOT FOUND
       OR p_target_allowance IS NULL
       OR p_target_allowance < 0
       OR p_target_allowance >= v_current_allowance THEN
        RETURN 'invalid_target';
    END IF;

    SELECT count(DISTINCT id) INTO v_distinct_count FROM unnest(v_ids) id;
    IF v_distinct_count <> cardinality(v_ids)
       OR cardinality(v_ids) > p_target_allowance THEN
        RETURN 'invalid_selection';
    END IF;

    SELECT count(*) INTO v_live_count
    FROM bank_connections
    WHERE household_id = p_household_id
      AND id = ANY(v_ids)
      AND deleted_at IS NULL
      AND status IN ('active', 'needs_reauth', 'error')
      AND encrypted_access_token IS NOT NULL;

    IF v_live_count <> cardinality(v_ids) THEN
        RETURN 'invalid_selection';
    END IF;

    v_selection_expiry := LEAST(
        now() + interval '370 days',
        GREATEST(
            now() + interval '24 hours',
            COALESCE(v_projection_expires + interval '24 hours', now() + interval '30 days')
        )
    );

    INSERT INTO bank_connection_retention_selections (
        household_id,
        selected_by,
        target_allowance,
        retained_connection_ids,
        source_allowance,
        source_projection_version,
        expires_at
    )
    VALUES (
        p_household_id,
        p_actor_id,
        p_target_allowance,
        v_ids,
        v_current_allowance,
        v_projection_version,
        v_selection_expiry
    )
    ON CONFLICT (household_id, target_allowance) DO UPDATE
    SET selected_by = EXCLUDED.selected_by,
        retained_connection_ids = EXCLUDED.retained_connection_ids,
        source_allowance = EXCLUDED.source_allowance,
        source_projection_version = EXCLUDED.source_projection_version,
        expires_at = EXCLUDED.expires_at,
        updated_at = now();

    RETURN 'accepted';
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Atomic enqueue-before-disable for downgrade/disconnect/deletion.
-- -----------------------------------------------------------------------------

CREATE FUNCTION public.enqueue_bank_connection_revocation(
    p_connection_id UUID,
    p_reason TEXT,
    p_actor_id UUID DEFAULT NULL,
    p_erasure_requested BOOLEAN DEFAULT false
)
RETURNS TABLE (result_status TEXT, outbox_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_connection bank_connections%ROWTYPE;
    v_existing bank_connection_orphaned_items%ROWTYPE;
    v_household_id UUID;
    v_outbox_id UUID;
    v_retain_until TIMESTAMPTZ;
BEGIN
    IF p_reason IS NULL OR p_reason NOT IN (
        'downgrade',
        'user_disconnect',
        'account_deletion'
    ) THEN
        RAISE EXCEPTION 'invalid revocation reason' USING ERRCODE = 'check_violation';
    END IF;

    SELECT household_id INTO v_household_id
    FROM bank_connections
    WHERE id = p_connection_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(
        bank_connection_reservation_lock_key(v_household_id)
    );

    SELECT * INTO v_connection
    FROM bank_connections
    WHERE id = p_connection_id
    FOR UPDATE;

    IF NOT FOUND OR v_connection.deleted_at IS NOT NULL THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    IF v_connection.household_id <> v_household_id THEN
        PERFORM pg_advisory_xact_lock(
            bank_connection_reservation_lock_key(v_connection.household_id)
        );
    END IF;

    IF p_actor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM household_members
        WHERE household_id = v_connection.household_id
          AND user_id = p_actor_id
          AND role IN ('owner', 'admin')
          AND deleted_at IS NULL
    ) THEN
        RETURN QUERY SELECT 'forbidden'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    SELECT * INTO v_existing
    FROM bank_connection_orphaned_items
    WHERE connection_id = p_connection_id
      AND status IN (
          'pending_revocation',
          'pending_reconciliation',
          'retry_wait',
          'processing',
          'exhausted'
      )
    FOR UPDATE;

    v_retain_until := now() + CASE
        WHEN p_erasure_requested THEN interval '7 days'
        ELSE interval '30 days'
    END;

    IF FOUND THEN
        UPDATE bank_connection_orphaned_items
        SET operation_reason = CASE
                WHEN p_reason = 'account_deletion' THEN p_reason
                ELSE operation_reason
            END,
            erasure_requested_at = CASE
                WHEN p_erasure_requested
                    THEN COALESCE(erasure_requested_at, now())
                ELSE erasure_requested_at
            END,
            retain_until = CASE
                WHEN p_erasure_requested THEN LEAST(retain_until, v_retain_until)
                ELSE retain_until
            END,
            reconciliation_required = CASE
                WHEN p_reason IN ('downgrade', 'user_disconnect', 'account_deletion')
                    THEN false
                ELSE reconciliation_required
            END,
            status = CASE
                WHEN status = 'exhausted' THEN 'pending_revocation'
                WHEN status = 'pending_reconciliation' THEN 'pending_revocation'
                ELSE status
            END,
            available_at = CASE
                WHEN status IN ('exhausted', 'pending_reconciliation') THEN now()
                ELSE available_at
            END,
            max_attempts = CASE
                WHEN status = 'exhausted' THEN LEAST(32, max_attempts + 8)
                ELSE max_attempts
            END,
            exhausted_at = NULL
        WHERE id = v_existing.id;
        v_outbox_id := v_existing.id;
    ELSE
        IF v_connection.encrypted_access_token IS NULL
           OR btrim(v_connection.encrypted_access_token) = '' THEN
            RAISE EXCEPTION 'connection has no revocation credential'
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
            last_error_code,
            operation_reason,
            idempotency_key,
            available_at,
            retain_until,
            erasure_requested_at,
            reconciliation_required
        )
        VALUES (
            v_connection.household_id,
            v_connection.owner_id,
            v_connection.id,
            v_connection.provider,
            v_connection.encrypted_access_token,
            'pending_revocation',
            0,
            NULL,
            p_reason,
            'connection:' || v_connection.id::TEXT,
            now(),
            v_retain_until,
            CASE WHEN p_erasure_requested THEN now() ELSE NULL END,
            false
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET operation_reason = CASE
                WHEN EXCLUDED.operation_reason = 'account_deletion'
                    THEN EXCLUDED.operation_reason
                ELSE bank_connection_orphaned_items.operation_reason
            END,
            erasure_requested_at = CASE
                WHEN EXCLUDED.erasure_requested_at IS NOT NULL
                    THEN COALESCE(
                        bank_connection_orphaned_items.erasure_requested_at,
                        EXCLUDED.erasure_requested_at
                    )
                ELSE bank_connection_orphaned_items.erasure_requested_at
            END,
            retain_until = CASE
                WHEN EXCLUDED.erasure_requested_at IS NOT NULL
                    THEN LEAST(
                        bank_connection_orphaned_items.retain_until,
                        EXCLUDED.retain_until
                    )
                ELSE bank_connection_orphaned_items.retain_until
            END,
            reconciliation_required = false,
            status = CASE
                WHEN bank_connection_orphaned_items.status IN (
                    'pending_reconciliation',
                    'exhausted'
                ) THEN 'pending_revocation'
                ELSE bank_connection_orphaned_items.status
            END,
            available_at = CASE
                WHEN bank_connection_orphaned_items.status IN (
                    'pending_reconciliation',
                    'exhausted'
                ) THEN now()
                ELSE bank_connection_orphaned_items.available_at
            END,
            max_attempts = CASE
                WHEN bank_connection_orphaned_items.status = 'exhausted'
                    THEN LEAST(32, bank_connection_orphaned_items.max_attempts + 8)
                ELSE bank_connection_orphaned_items.max_attempts
            END,
            exhausted_at = NULL
        RETURNING id INTO v_outbox_id;
    END IF;

    UPDATE bank_connections
    SET status = 'revocation_pending',
        sync_disabled_at = COALESCE(sync_disabled_at, now()),
        encrypted_access_token = NULL,
        error_code = NULL,
        error_message = NULL
    WHERE id = p_connection_id;

    RETURN QUERY SELECT 'enqueued'::TEXT, v_outbox_id;
END;
$$;

CREATE FUNCTION public.apply_bank_connection_allowance_reduction(
    p_household_id UUID,
    p_new_allowance BIGINT,
    p_source_allowance BIGINT DEFAULT NULL,
    p_source_projection_version BIGINT DEFAULT NULL
)
RETURNS TABLE (retained BIGINT, queued BIGINT, explicit_selection_used BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_selection bank_connection_retention_selections%ROWTYPE;
    v_retained_ids UUID[] := ARRAY[]::UUID[];
    v_current_allowance BIGINT;
    v_current_projection_version BIGINT;
    v_candidate_count BIGINT;
    v_retained_count BIGINT := 0;
    v_queued BIGINT := 0;
    v_valid_selection BOOLEAN := false;
    v_connection RECORD;
BEGIN
    IF p_new_allowance IS NULL OR p_new_allowance < 0 THEN
        RAISE EXCEPTION 'new allowance must be non-negative'
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    SELECT
        bank_connection_cap_for_household(p_household_id),
        projection_version
    INTO v_current_allowance, v_current_projection_version
    FROM current_household_entitlements
    WHERE household_id = p_household_id;

    SELECT count(*) INTO v_candidate_count
    FROM bank_connections
    WHERE household_id = p_household_id
      AND deleted_at IS NULL
      AND status IN ('active', 'needs_reauth', 'error')
      AND encrypted_access_token IS NOT NULL;

    IF COALESCE(v_current_allowance, 0) <> p_new_allowance
       OR (
           p_source_projection_version IS NOT NULL
           AND v_current_projection_version <> p_source_projection_version
           AND v_current_projection_version <> p_source_projection_version + 1
       )
       OR v_candidate_count <= COALESCE(v_current_allowance, 0) THEN
        RETURN QUERY SELECT v_candidate_count, 0::BIGINT, false;
        RETURN;
    END IF;

    SELECT * INTO v_selection
    FROM bank_connection_retention_selections
    WHERE household_id = p_household_id
      AND target_allowance = p_new_allowance
      AND expires_at > now()
    ORDER BY updated_at DESC, id
    LIMIT 1
    FOR UPDATE;

    IF FOUND
       AND p_source_allowance IS NOT NULL
       AND p_source_projection_version IS NOT NULL
       AND v_selection.source_allowance = p_source_allowance
       AND v_selection.source_projection_version = p_source_projection_version
       AND v_selection.selected_by IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM household_members
           WHERE household_id = p_household_id
             AND user_id = v_selection.selected_by
             AND role IN ('owner', 'admin')
             AND deleted_at IS NULL
       )
       AND cardinality(v_selection.retained_connection_ids) <= p_new_allowance
       AND (
           SELECT count(DISTINCT id) = cardinality(v_selection.retained_connection_ids)
           FROM unnest(v_selection.retained_connection_ids) id
       )
       AND (
           SELECT count(*) = cardinality(v_selection.retained_connection_ids)
           FROM bank_connections
           WHERE household_id = p_household_id
             AND id = ANY(v_selection.retained_connection_ids)
             AND deleted_at IS NULL
             AND status IN ('active', 'needs_reauth', 'error')
             AND encrypted_access_token IS NOT NULL
       ) THEN
        v_retained_ids := v_selection.retained_connection_ids;
        v_valid_selection := true;
    ELSE
        SELECT COALESCE(array_agg(id ORDER BY created_at, id), ARRAY[]::UUID[])
        INTO v_retained_ids
        FROM (
            SELECT id, created_at
            FROM bank_connections
            WHERE household_id = p_household_id
              AND deleted_at IS NULL
              AND status IN ('active', 'needs_reauth', 'error')
              AND encrypted_access_token IS NOT NULL
            ORDER BY created_at, id
            LIMIT p_new_allowance
        ) fallback;
    END IF;

    v_retained_count := cardinality(v_retained_ids);

    FOR v_connection IN
        SELECT id
        FROM bank_connections
        WHERE household_id = p_household_id
          AND deleted_at IS NULL
          AND status IN ('active', 'needs_reauth', 'error')
          AND encrypted_access_token IS NOT NULL
          AND NOT (id = ANY(v_retained_ids))
        ORDER BY created_at, id
    LOOP
        PERFORM *
        FROM enqueue_bank_connection_revocation(
            v_connection.id,
            'downgrade',
            NULL,
            false
        );
        v_queued := v_queued + 1;
    END LOOP;

    DELETE FROM bank_connection_retention_selections
    WHERE household_id = p_household_id
      AND (
          target_allowance = p_new_allowance
          OR expires_at <= now()
      );

    RETURN QUERY SELECT
        LEAST(v_retained_count, v_candidate_count),
        v_queued,
        v_valid_selection;
END;
$$;

-- Aggregator writes take the same household lock as disconnect/downgrade.
-- Whichever transaction wins defines the boundary: writes committed before
-- sync disable remain history; writes attempting after disable fail closed.
CREATE FUNCTION public.enforce_active_bank_connection_for_aggregator_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_connection_id UUID;
    v_service_authority BOOLEAN;
BEGIN
    v_service_authority :=
        COALESCE(auth.role(), '') = 'service_role'
        OR COALESCE(current_setting('role', true), '') = 'service_role';

    -- Users may edit historical imported rows after disconnect, but cannot
    -- create aggregator provenance or rewrite its server-issued source keys.
    IF NOT v_service_authority THEN
        IF TG_OP = 'UPDATE' AND OLD.source = 'aggregator' THEN
            IF NEW.source IS DISTINCT FROM OLD.source
               OR NEW.import_source_id IS DISTINCT FROM OLD.import_source_id
               OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN
                RAISE EXCEPTION 'aggregator provenance is server managed'
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
            RETURN NEW;
        END IF;
        IF NEW.source = 'aggregator' THEN
            RAISE EXCEPTION 'aggregator provenance is server managed'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.source <> 'aggregator' THEN
        RETURN NEW;
    END IF;
    IF NEW.import_source_id IS NULL
       OR NEW.import_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'aggregator transaction is missing its connection source'
            USING ERRCODE = 'check_violation';
    END IF;

    v_connection_id := NEW.import_source_id::UUID;
    PERFORM pg_advisory_xact_lock(
        bank_connection_reservation_lock_key(NEW.household_id)
    );

    IF NOT EXISTS (
        SELECT 1
        FROM bank_connections c
        JOIN bank_connection_accounts ca
          ON ca.bank_connection_id = c.id
         AND ca.account_id = NEW.account_id
         AND ca.household_id = NEW.household_id
         AND ca.is_linked
         AND ca.deleted_at IS NULL
        WHERE c.id = v_connection_id
          AND c.household_id = NEW.household_id
          AND c.status = 'active'
          AND c.deleted_at IS NULL
          AND c.encrypted_access_token IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'bank connection synchronization is disabled'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1
        FROM transactions
        WHERE import_source_id = NEW.import_source_id
          AND provider_transaction_id = NEW.provider_transaction_id
          AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'aggregator transaction already exists'
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transactions_require_active_bank_connection
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_active_bank_connection_for_aggregator_write();

CREATE FUNCTION public.transition_bank_connection_sync_state(
    p_connection_id UUID,
    p_new_status TEXT,
    p_error_code TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID;
    v_updated INTEGER;
BEGIN
    IF p_new_status NOT IN ('needs_reauth', 'disconnected', 'error') THEN
        RAISE EXCEPTION 'invalid synchronization state'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT household_id INTO v_household_id
    FROM bank_connections
    WHERE id = p_connection_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    PERFORM pg_advisory_xact_lock(
        bank_connection_reservation_lock_key(v_household_id)
    );

    UPDATE bank_connections
    SET status = p_new_status,
        error_code = p_error_code,
        error_message = p_error_message
    WHERE id = p_connection_id
      AND household_id = v_household_id
      AND status = 'active'
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

CREATE FUNCTION public.enforce_bank_connection_allowance_reduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.bank_connection_allowance > NEW.bank_connection_allowance THEN
        PERFORM *
        FROM apply_bank_connection_allowance_reduction(
            NEW.household_id,
            NEW.bank_connection_allowance,
            OLD.bank_connection_allowance,
            OLD.projection_version
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_current_household_entitlement_bank_downgrade
    AFTER UPDATE OF bank_connection_allowance ON current_household_entitlements
    FOR EACH ROW
    WHEN (OLD.bank_connection_allowance > NEW.bank_connection_allowance)
    EXECUTE FUNCTION public.enforce_bank_connection_allowance_reduction();

CREATE FUNCTION public.reconcile_bank_connection_allowances(
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (households BIGINT, queued BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household RECORD;
    v_result RECORD;
    v_households BIGINT := 0;
    v_queued BIGINT := 0;
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
        RAISE EXCEPTION 'reconciliation limit must be between 1 and 1000'
            USING ERRCODE = 'check_violation';
    END IF;

    DELETE FROM bank_connection_retention_selections WHERE expires_at <= now();

    FOR v_household IN
        SELECT
            c.household_id,
            bank_connection_cap_for_household(c.household_id) AS allowance,
            h.bank_connection_allowance AS source_allowance,
            h.projection_version AS source_projection_version
        FROM bank_connections c
        LEFT JOIN current_household_entitlements h
            ON h.household_id = c.household_id
        WHERE c.deleted_at IS NULL
          AND c.status IN ('active', 'needs_reauth', 'error')
          AND c.encrypted_access_token IS NOT NULL
        GROUP BY
            c.household_id,
            h.bank_connection_allowance,
            h.projection_version
        HAVING count(*) > bank_connection_cap_for_household(c.household_id)
        ORDER BY c.household_id
        LIMIT p_limit
    LOOP
        SELECT * INTO v_result
        FROM apply_bank_connection_allowance_reduction(
            v_household.household_id,
            v_household.allowance,
            v_household.source_allowance,
            v_household.source_projection_version
        );
        v_households := v_households + 1;
        v_queued := v_queued + COALESCE(v_result.queued, 0);
    END LOOP;

    RETURN QUERY SELECT v_households, v_queued;
END;
$$;

CREATE FUNCTION public.enqueue_bank_connection_erasure(
    p_owner_id UUID,
    p_household_ids UUID[] DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_connection RECORD;
    v_household RECORD;
    v_count BIGINT := 0;
BEGIN
    IF p_owner_id IS NOT NULL THEN
        INSERT INTO bank_connection_erasure_barriers (owner_fingerprint, expires_at)
        VALUES (
            bank_connection_owner_fingerprint(p_owner_id),
            now() + interval '24 hours'
        )
        ON CONFLICT (owner_fingerprint) DO UPDATE
        SET expires_at = GREATEST(
                bank_connection_erasure_barriers.expires_at,
                EXCLUDED.expires_at
            ),
            updated_at = now();
    END IF;

    FOR v_household IN
        SELECT household_id
        FROM (
            SELECT household_id
            FROM household_members
            WHERE user_id = p_owner_id
              AND deleted_at IS NULL
            UNION
            SELECT household_id
            FROM bank_connections
            WHERE owner_id = p_owner_id
              AND deleted_at IS NULL
        ) affected
        ORDER BY household_id
    LOOP
        PERFORM pg_advisory_xact_lock(
            bank_connection_reservation_lock_key(v_household.household_id)
        );
    END LOOP;

    FOR v_connection IN
        SELECT id
        FROM bank_connections
        WHERE deleted_at IS NULL
          AND status IN ('active', 'needs_reauth', 'error')
          AND encrypted_access_token IS NOT NULL
          AND (
              (p_owner_id IS NOT NULL AND owner_id = p_owner_id)
              OR (
                  p_household_ids IS NOT NULL
                  AND household_id = ANY(p_household_ids)
              )
          )
        ORDER BY household_id, created_at, id
    LOOP
        PERFORM *
        FROM enqueue_bank_connection_revocation(
            v_connection.id,
            'account_deletion',
            NULL,
            true
        );
        v_count := v_count + 1;
    END LOOP;

    UPDATE bank_connection_orphaned_items
    SET operation_reason = 'account_deletion',
        erasure_requested_at = COALESCE(erasure_requested_at, now()),
        retain_until = LEAST(retain_until, now() + interval '7 days'),
        reconciliation_required = false,
        status = CASE
            WHEN status = 'pending_reconciliation' THEN 'pending_revocation'
            WHEN status = 'exhausted' THEN 'pending_revocation'
            ELSE status
        END,
        available_at = CASE
            WHEN status IN ('pending_reconciliation', 'exhausted') THEN now()
            ELSE available_at
        END,
        max_attempts = CASE
            WHEN status = 'exhausted' THEN LEAST(32, max_attempts + 8)
            ELSE max_attempts
        END,
        exhausted_at = NULL
    WHERE status IN (
            'pending_revocation',
            'pending_reconciliation',
            'retry_wait',
            'processing',
            'exhausted'
        )
      AND (
          (p_owner_id IS NOT NULL AND owner_id = p_owner_id)
          OR (
              p_household_ids IS NOT NULL
              AND household_id = ANY(p_household_ids)
          )
      );

    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Concurrent worker leasing, reconciliation, retry, and terminal purge.
-- -----------------------------------------------------------------------------

CREATE FUNCTION public.claim_bank_revocation_jobs(
    p_limit INTEGER DEFAULT 10,
    p_lease INTERVAL DEFAULT interval '5 minutes'
)
RETURNS TABLE (
    id UUID,
    provider TEXT,
    encrypted_access_token TEXT,
    connection_id UUID,
    operation_reason TEXT,
    reconciliation_required BOOLEAN,
    claim_token UUID,
    attempt_number INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'claim limit must be between 1 and 100'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_lease IS NULL
       OR p_lease < interval '30 seconds'
       OR p_lease > interval '15 minutes' THEN
        RAISE EXCEPTION 'lease must be between 30 seconds and 15 minutes'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE bank_connection_orphaned_items
    SET status = 'exhausted',
        exhausted_at = now(),
        available_at = retain_until,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claim_token = NULL,
        last_error_code = COALESCE(last_error_code, 'WORKER_LEASE_EXHAUSTED')
    WHERE status = 'processing'
      AND claim_expires_at <= now()
      AND attempts >= max_attempts
      AND completion_recovery_attempts >= max_completion_recovery_attempts
      AND retain_until > now();

    RETURN QUERY
    WITH claimable AS MATERIALIZED (
        SELECT o.id
        FROM bank_connection_orphaned_items o
        WHERE (
                o.status IN (
                    'pending_revocation',
                    'pending_reconciliation',
                    'retry_wait'
                )
                AND (
                    o.attempts < o.max_attempts
                    OR (
                        o.attempts >= o.max_attempts
                        AND o.completion_recovery_attempts > 0
                        AND o.completion_recovery_attempts
                            < o.max_completion_recovery_attempts
                    )
                )
                OR (
                    o.status = 'processing'
                    AND o.claim_expires_at <= now()
                    AND (
                        o.attempts < o.max_attempts
                        OR o.completion_recovery_attempts
                            < o.max_completion_recovery_attempts
                    )
                )
            )
          AND o.available_at <= now()
          AND o.retain_until > now()
        ORDER BY o.available_at, o.created_at, o.id
        FOR UPDATE OF o SKIP LOCKED
        LIMIT p_limit
    ),
    claimed AS (
        UPDATE bank_connection_orphaned_items o
        SET status = 'processing',
            claimed_at = now(),
            claim_expires_at = now() + p_lease,
            claim_token = gen_random_uuid(),
            last_attempt_at = now(),
            attempts = CASE
                WHEN o.attempts < o.max_attempts THEN o.attempts + 1
                ELSE o.attempts
            END,
            completion_recovery_attempts = CASE
                WHEN o.attempts >= o.max_attempts
                    THEN o.completion_recovery_attempts + 1
                ELSE o.completion_recovery_attempts
            END,
            exhausted_at = NULL
        FROM claimable c
        WHERE o.id = c.id
        RETURNING o.*
    )
    SELECT
        c.id,
        c.provider,
        CASE
            WHEN c.reconciliation_required THEN NULL
            ELSE c.encrypted_access_token
        END,
        c.connection_id,
        c.operation_reason,
        c.reconciliation_required,
        c.claim_token,
        c.attempts
    FROM claimed c
    ORDER BY c.available_at, c.created_at, c.id;
END;
$$;

CREATE FUNCTION public.resolve_bank_revocation_reconciliation(
    p_id UUID,
    p_claim_token UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job bank_connection_orphaned_items%ROWTYPE;
    v_connection bank_connections%ROWTYPE;
    v_open_reservations BIGINT;
BEGIN
    SELECT * INTO v_job
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND status = 'processing'
      AND claim_token = p_claim_token;

    IF NOT FOUND THEN
        RETURN 'lost_claim';
    END IF;

    IF v_job.household_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            bank_connection_reservation_lock_key(v_job.household_id)
        );
    END IF;

    SELECT * INTO v_job
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND status = 'processing'
      AND claim_token = p_claim_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'lost_claim';
    END IF;
    IF NOT v_job.reconciliation_required THEN
        UPDATE bank_connection_orphaned_items
        SET status = 'retry_wait',
            available_at = now(),
            claimed_at = NULL,
            claim_expires_at = NULL,
            claim_token = NULL
        WHERE id = p_id;
        RETURN 'ready';
    END IF;
    IF v_job.household_id IS NULL OR v_job.connection_id IS NULL THEN
        RETURN 'retry';
    END IF;

    SELECT * INTO v_connection
    FROM bank_connections
    WHERE id = v_job.connection_id
      AND household_id = v_job.household_id
    FOR UPDATE;

    IF FOUND
       AND v_connection.deleted_at IS NULL
       AND v_connection.status <> 'revocation_pending' THEN
        UPDATE bank_connection_orphaned_items
        SET status = 'reconciled',
            encrypted_access_token = NULL,
            revoked_at = now(),
            claimed_at = NULL,
            claim_expires_at = NULL,
            claim_token = NULL,
            reconciliation_required = false,
            idempotency_key = 'reconciled:' || id::TEXT,
            last_error_code = NULL
        WHERE id = p_id;
        RETURN 'reconciled';
    END IF;

    DELETE FROM bank_connection_reservations
    WHERE household_id = v_job.household_id
      AND expires_at <= now();

    SELECT count(*) INTO v_open_reservations
    FROM bank_connection_reservations
    WHERE household_id = v_job.household_id
      AND expires_at > now();

    IF v_open_reservations > 0 THEN
        RETURN 'retry';
    END IF;

    UPDATE bank_connection_orphaned_items
    SET reconciliation_required = false,
        status = 'retry_wait',
        available_at = now(),
        claimed_at = NULL,
        claim_expires_at = NULL,
        claim_token = NULL
    WHERE id = p_id;
    RETURN 'ready';
END;
$$;

CREATE FUNCTION public.retry_bank_revocation_job(
    p_id UUID,
    p_claim_token UUID,
    p_error_code TEXT
)
RETURNS TABLE (result_status TEXT, next_attempt_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job bank_connection_orphaned_items%ROWTYPE;
    v_attempts INTEGER;
    v_error_code TEXT;
    v_base_seconds DOUBLE PRECISION;
    v_jitter DOUBLE PRECISION;
    v_next TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_job
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND status = 'processing'
      AND claim_token = p_claim_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'lost_claim'::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    v_attempts := v_job.attempts;
    v_error_code := CASE
        WHEN p_error_code ~ '^[A-Z0-9_]{1,64}$' THEN p_error_code
        ELSE 'UNCLASSIFIED_FAILURE'
    END;

    IF (
        v_attempts >= v_job.max_attempts
        AND v_job.completion_recovery_attempts = 0
    )
    OR v_job.completion_recovery_attempts >= v_job.max_completion_recovery_attempts THEN
        UPDATE bank_connection_orphaned_items
        SET status = 'exhausted',
            attempts = v_attempts,
            last_error_code = v_error_code,
            exhausted_at = now(),
            available_at = retain_until,
            claimed_at = NULL,
            claim_expires_at = NULL,
            claim_token = NULL
        WHERE id = p_id;

        RETURN QUERY SELECT 'exhausted'::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    v_base_seconds := LEAST(
        3600.0,
        30.0 * power(2.0, LEAST(v_attempts - 1, 10))
    );
    v_jitter := 0.75 + (
        ((hashtextextended(p_id::TEXT || ':' || v_attempts::TEXT, 4405) % 501) + 501) % 501
    ) / 1000.0;
    v_next := now() + make_interval(secs => v_base_seconds * v_jitter);

    UPDATE bank_connection_orphaned_items
    SET status = 'retry_wait',
        attempts = v_attempts,
        last_error_code = v_error_code,
        available_at = v_next,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claim_token = NULL,
        exhausted_at = NULL
    WHERE id = p_id;

    RETURN QUERY SELECT 'retry_wait'::TEXT, v_next;
END;
$$;

CREATE FUNCTION public.complete_bank_revocation_job(
    p_id UUID,
    p_claim_token UUID,
    p_provider_outcome TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job bank_connection_orphaned_items%ROWTYPE;
    v_connection bank_connections%ROWTYPE;
BEGIN
    IF p_provider_outcome IS NULL
       OR p_provider_outcome NOT IN ('revoked', 'already_invalid') THEN
        RAISE EXCEPTION 'provider outcome is not terminal success'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_job
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND status = 'processing'
      AND claim_token = p_claim_token;

    IF NOT FOUND THEN
        RETURN false;
    END IF;
    IF v_job.reconciliation_required THEN
        RAISE EXCEPTION 'reconciliation must complete before provider revocation'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_job.household_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            bank_connection_reservation_lock_key(v_job.household_id)
        );
    END IF;

    IF v_job.connection_id IS NOT NULL THEN
        SELECT * INTO v_connection
        FROM bank_connections
        WHERE id = v_job.connection_id
        FOR UPDATE;

        IF FOUND AND (
            v_job.household_id IS NULL
            OR v_connection.household_id <> v_job.household_id
            OR v_connection.provider <> v_job.provider
            OR v_connection.status NOT IN ('revocation_pending', 'disconnected')
        ) THEN
            RAISE EXCEPTION 'revocation job does not match a disabled connection'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    SELECT * INTO v_job
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND status = 'processing'
      AND claim_token = p_claim_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_job.connection_id IS NOT NULL THEN
        UPDATE bank_connections
        SET status = 'disconnected',
            deleted_at = COALESCE(deleted_at, now()),
            encrypted_access_token = NULL,
            sync_disabled_at = COALESCE(sync_disabled_at, now()),
            error_code = NULL,
            error_message = NULL
        WHERE id = v_job.connection_id;
    END IF;

    UPDATE bank_connection_orphaned_items
    SET status = 'revoked',
        encrypted_access_token = NULL,
        revoked_at = now(),
        last_error_code = CASE
            WHEN p_provider_outcome = 'already_invalid' THEN 'ALREADY_INVALID'
            ELSE NULL
        END,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claim_token = NULL,
        exhausted_at = NULL,
        reconciliation_required = false
    WHERE id = p_id;

    RETURN true;
END;
$$;

CREATE FUNCTION public.requeue_exhausted_bank_revocation_job(
    p_id UUID,
    p_additional_attempts INTEGER DEFAULT 4
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    IF p_additional_attempts IS NULL
       OR p_additional_attempts < 1
       OR p_additional_attempts > 8 THEN
        RAISE EXCEPTION 'additional attempts must be between 1 and 8'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE bank_connection_orphaned_items
    SET status = 'retry_wait',
        max_attempts = LEAST(32, max_attempts + p_additional_attempts),
        available_at = now(),
        exhausted_at = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claim_token = NULL
    WHERE id = p_id
      AND status = 'exhausted'
      AND encrypted_access_token IS NOT NULL
      AND retain_until > now()
      AND max_attempts < 32;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

CREATE FUNCTION public.bank_revocation_reconciliation_summary()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'pending', count(*) FILTER (
            WHERE status IN ('pending_revocation', 'pending_reconciliation', 'retry_wait')
        ),
        'processing', count(*) FILTER (WHERE status = 'processing'),
        'exhausted', count(*) FILTER (WHERE status = 'exhausted'),
        'abandoned', count(*) FILTER (WHERE status = 'abandoned'),
        'oldest_available_at', min(available_at) FILTER (
            WHERE status IN ('pending_revocation', 'pending_reconciliation', 'retry_wait')
        )
    )
    FROM bank_connection_orphaned_items;
$$;

CREATE FUNCTION public.dispatch_bank_revocation_worker()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_cron_secret TEXT;
    v_request_id BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
       OR to_regclass('vault.decrypted_secrets') IS NULL THEN
        RAISE EXCEPTION 'bank revocation worker dispatch infrastructure is unavailable';
    END IF;

    EXECUTE
        'SELECT decrypted_secret FROM vault.decrypted_secrets '
        'WHERE name = $1 ORDER BY created_at DESC LIMIT 1'
    INTO v_url
    USING 'bank_revocation_worker_url';

    EXECUTE
        'SELECT decrypted_secret FROM vault.decrypted_secrets '
        'WHERE name = $1 ORDER BY created_at DESC LIMIT 1'
    INTO v_cron_secret
    USING 'bank_revocation_cron_secret';

    IF v_url IS NULL OR v_cron_secret IS NULL THEN
        RAISE EXCEPTION 'bank revocation worker dispatch configuration is missing';
    END IF;

    EXECUTE $dispatch$
        SELECT net.http_post(
            url := $1,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || $2
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 10000
        )
    $dispatch$
    INTO v_request_id
    USING v_url, v_cron_secret;

    RETURN v_request_id;
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
    v_job RECORD;
    v_updated INTEGER;
BEGIN
    v_abandoned := 0;

    FOR v_job IN
        SELECT id, connection_id, household_id, provider
        FROM bank_connection_orphaned_items
        WHERE (
                status IN (
                    'pending_revocation',
                    'pending_reconciliation',
                    'retry_wait',
                    'exhausted'
                )
                OR (
                    status = 'processing'
                    AND claim_expires_at <= now()
                )
            )
          AND retain_until <= now()
        ORDER BY household_id NULLS LAST, id
    LOOP
        IF v_job.household_id IS NOT NULL THEN
            PERFORM pg_advisory_xact_lock(
                bank_connection_reservation_lock_key(v_job.household_id)
            );
        END IF;

        IF v_job.connection_id IS NOT NULL THEN
            UPDATE bank_connections
            SET status = 'disconnected',
                deleted_at = COALESCE(deleted_at, now()),
                encrypted_access_token = NULL,
                sync_disabled_at = COALESCE(sync_disabled_at, now()),
                error_code = 'REVOCATION_RETENTION_EXHAUSTED',
                error_message = NULL
            WHERE id = v_job.connection_id
              AND household_id = v_job.household_id
              AND provider = v_job.provider
              AND status = 'revocation_pending';
        END IF;

        UPDATE bank_connection_orphaned_items
        SET status = 'abandoned',
            encrypted_access_token = NULL,
            revoked_at = now(),
            last_error_code = COALESCE(last_error_code, 'RETENTION_EXPIRED'),
            claimed_at = NULL,
            claim_expires_at = NULL,
            claim_token = NULL,
            exhausted_at = NULL,
            reconciliation_required = false
        WHERE id = v_job.id
          AND (
                status IN (
                    'pending_revocation',
                    'pending_reconciliation',
                    'retry_wait',
                    'exhausted'
                )
                OR (
                    status = 'processing'
                    AND claim_expires_at <= now()
                )
            )
          AND retain_until <= now()
        ;

        GET DIAGNOSTICS v_updated = ROW_COUNT;
        v_abandoned := v_abandoned + v_updated;
    END LOOP;

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

-- Keep the existing daily maintenance path authoritative even where pg_cron is
-- unavailable. Its output contains counts/timestamps only and is alert-safe.
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
    v_bank_downgrades RECORD;
    v_erasure_barriers INTEGER;
    v_revocation_summary JSONB;
    v_revocation_dispatch TEXT := 'unavailable';
    v_revocation_request_id BIGINT;
    v_analyze_result TEXT;
BEGIN
    v_rate_limits := cleanup_expired_rate_limits();
    v_webauthn := cleanup_expired_webauthn_challenges();
    v_sync_logs := cleanup_old_sync_health_logs();
    v_invitations := cleanup_expired_invitations();
    v_audit_logs := cleanup_old_audit_logs(retention_days => 90);
    SELECT * INTO v_bank_downgrades FROM reconcile_bank_connection_allowances();
    SELECT * INTO v_bank_orphans FROM purge_expired_orphaned_bank_items();
    DELETE FROM bank_connection_erasure_barriers WHERE expires_at <= now();
    GET DIAGNOSTICS v_erasure_barriers = ROW_COUNT;
    v_revocation_summary := bank_revocation_reconciliation_summary();
    v_analyze_result := vacuum_analyze_tables();

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
       AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
        BEGIN
            v_revocation_request_id := dispatch_bank_revocation_worker();
            v_revocation_dispatch := CASE
                WHEN v_revocation_request_id IS NULL THEN 'failed'
                ELSE 'queued'
            END;
        EXCEPTION
            WHEN OTHERS THEN
                -- Secret-safe failure signal: cron/maintenance output contains
                -- no URL, secret, provider, connection, or raw error.
                v_revocation_dispatch := 'failed';
        END;
    END IF;

    RETURN jsonb_build_object(
        'rate_limits_deleted', v_rate_limits,
        'webauthn_challenges_deleted', v_webauthn,
        'sync_health_logs_deleted', v_sync_logs,
        'invitations_expired', v_invitations,
        'audit_logs_deleted', v_audit_logs,
        'bank_downgrade_households', v_bank_downgrades.households,
        'bank_downgrade_connections_queued', v_bank_downgrades.queued,
        'bank_orphans_abandoned', v_bank_orphans.abandoned,
        'bank_orphans_deleted', v_bank_orphans.deleted,
        'bank_erasure_barriers_deleted', v_erasure_barriers,
        'bank_revocations_pending', v_revocation_summary -> 'pending',
        'bank_revocations_exhausted', v_revocation_summary -> 'exhausted',
        'bank_revocation_dispatch', v_revocation_dispatch,
        'analyze_result', v_analyze_result,
        'completed_at', now()
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Least privilege: all credential-bearing and mutation RPCs are server-only.
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.prepare_bank_revocation_outbox_row()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_bank_connection_retention_selection(
    UUID, UUID, BIGINT, UUID[]
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_or_enqueue_bank_connection(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation(
    UUID, TEXT, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_bank_connection_allowance_reduction(
    UUID, BIGINT, BIGINT, BIGINT
)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_bank_connection_allowance_reduction()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_bank_connection_allowances(INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_bank_connection_erasure(UUID, UUID[])
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_bank_revocation_jobs(INTEGER, INTERVAL)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_bank_revocation_reconciliation(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retry_bank_revocation_job(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_bank_revocation_job(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.requeue_exhausted_bank_revocation_job(UUID, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bank_revocation_reconciliation_summary()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_bank_revocation_worker()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_active_bank_connection_for_aggregator_write()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_bank_connection_erasure_barrier()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bank_connection_owner_fingerprint(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transition_bank_connection_sync_state(
    UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_bank_connection_retention_selection(
    UUID, UUID, BIGINT, UUID[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_or_enqueue_bank_connection(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation(
    UUID, TEXT, UUID, BOOLEAN
) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_bank_connection_allowance_reduction(
    UUID, BIGINT, BIGINT, BIGINT
)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_connection_allowances(INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_bank_connection_erasure(UUID, UUID[])
    TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_bank_revocation_jobs(INTEGER, INTERVAL)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_bank_revocation_reconciliation(UUID, UUID)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_bank_revocation_job(UUID, UUID, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_bank_revocation_job(UUID, UUID, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_exhausted_bank_revocation_job(UUID, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.bank_revocation_reconciliation_summary()
    TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_bank_revocation_worker()
    TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_bank_connection_sync_state(
    UUID, TEXT, TEXT, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;

-- Trigger functions have no direct caller.
REVOKE EXECUTE ON FUNCTION public.prepare_bank_revocation_outbox_row() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_bank_connection_allowance_reduction()
    FROM service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_active_bank_connection_for_aggregator_write()
    FROM service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_bank_connection_erasure_barrier()
    FROM service_role;
REVOKE EXECUTE ON FUNCTION public.bank_connection_owner_fingerprint(UUID)
    FROM service_role;

-- The existing outbox table remains RLS-enabled with no client policies.
REVOKE ALL ON TABLE bank_connection_orphaned_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_connection_orphaned_items TO service_role;
REVOKE ALL ON TABLE bank_connection_erasure_barriers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_connection_erasure_barriers TO service_role;

-- Reconcile clock-driven expiry even when no provider event updates the
-- projection row. The external Edge worker separately drains provider calls.
DO $cron$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'reconcile-bank-connection-downgrades',
            '*/5 * * * *',
            $$SELECT public.reconcile_bank_connection_allowances()$$
        );

        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
           AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
            PERFORM cron.schedule(
                'dispatch-bank-revocation-worker',
                '* * * * *',
                $$SELECT public.dispatch_bank_revocation_worker()$$
            );
        ELSE
            RAISE WARNING
                'pg_net/vault unavailable - bank revocation worker dispatch is not scheduled';
        END IF;
    ELSE
        RAISE NOTICE 'pg_cron not available - downgrade reconciliation runs via maintenance.';
    END IF;
END $cron$;

-- Rollback: down/20260908000002_durable_bank_revocation.down.sql
