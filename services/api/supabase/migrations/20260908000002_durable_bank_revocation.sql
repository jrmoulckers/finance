-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Migration: 20260908000002_durable_bank_revocation
-- Description: Durable downgrade and provider revocation outbox (#4405)
-- =============================================================================
-- Evolves the Stage 6 orphan handoff into the single durable provider-revocation
-- outbox. No second retry store is introduced.

-- A connection remains visible, but cannot synchronize, while revocation is
-- pending. Its imported accounts and financial history are not modified.
ALTER TABLE bank_connections
    DROP CONSTRAINT bank_connections_status_valid;
ALTER TABLE bank_connections
    ADD CONSTRAINT bank_connections_status_valid CHECK (
        status IN ('active', 'needs_reauth', 'disconnected', 'error', 'revocation_pending')
    ),
    ALTER COLUMN encrypted_access_token DROP NOT NULL;

-- Provider lifecycle writes must pass through the transactional server RPCs.
-- Financial metadata can still use the existing direct-write path, but a
-- client cannot delete a connection or discard/disable its credential without
-- first creating durable revocation work.
CREATE FUNCTION public.guard_bank_connection_provider_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'bank connection provider lifecycle requires the server API'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bank_connection_provider_lifecycle
    BEFORE DELETE OR UPDATE OF status, deleted_at, encrypted_access_token
    ON bank_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_bank_connection_provider_lifecycle();

REVOKE EXECUTE ON FUNCTION public.guard_bank_connection_provider_lifecycle()
    FROM PUBLIC, anon, authenticated;

-- Server-validated, short-lived selection used only when the authoritative
-- household projection later commits a cap-reducing transition.
CREATE TABLE bank_connection_retention_selections (
    household_id            UUID        PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
    actor_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_tier              TEXT        NOT NULL
                                       CHECK (source_tier IN ('premium', 'family')),
    target_tier              TEXT        NOT NULL
                                       CHECK (target_tier IN ('free', 'plus', 'premium')),
    target_allowance         BIGINT      NOT NULL CHECK (target_allowance >= 0),
    selected_connection_ids UUID[]      NOT NULL DEFAULT '{}'::UUID[],
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at               TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
    CHECK (expires_at > created_at)
);

ALTER TABLE bank_connection_retention_selections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bank_connection_retention_selections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_connection_retention_selections TO service_role;

COMMENT ON TABLE bank_connection_retention_selections IS
    'Server-only, expiring downgrade retention choices (#4405). The RPC '
    'validates the actor, entitlement subject, transition, and every selected '
    'live connection. Never PowerSync-delivered or exported.';

-- Expand the Stage 6 handoff into a leased outbox. Existing
-- pending_reconciliation rows retain their ambiguity guard.
ALTER TABLE bank_connection_orphaned_items
    ADD COLUMN source_reason   TEXT NOT NULL DEFAULT 'finalization'
                               CHECK (source_reason IN (
                                   'finalization', 'disconnect', 'downgrade', 'account_deletion'
                               )),
    ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN claimed_by      UUID,
    ADD COLUMN claim_expires_at TIMESTAMPTZ,
    ADD COLUMN max_attempts    INTEGER NOT NULL DEFAULT 12
                               CHECK (max_attempts BETWEEN 1 AND 100),
    ADD COLUMN dedupe_key      BYTEA,
    ADD CONSTRAINT bank_connection_orphaned_items_claim_check CHECK (
        (claimed_by IS NULL AND claim_expires_at IS NULL)
        OR (claimed_by IS NOT NULL AND claim_expires_at IS NOT NULL)
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_error_safe CHECK (
        last_error_code IS NULL
        OR (
            length(last_error_code) <= 128
            AND last_error_code !~ '[[:cntrl:]]'
        )
    );

UPDATE bank_connection_orphaned_items
SET dedupe_key = digest(connection_id::TEXT, 'sha256')
WHERE connection_id IS NOT NULL;

ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT bank_connection_orphaned_items_status_valid,
    DROP CONSTRAINT bank_connection_orphaned_items_terminal_check;

ALTER TABLE bank_connection_orphaned_items
    ADD CONSTRAINT bank_connection_orphaned_items_status_valid CHECK (
        status IN (
            'pending_revocation',
            'pending_reconciliation',
            'exhausted',
            'revoked',
            'reconciled',
            'abandoned'
        )
    ),
    ADD CONSTRAINT bank_connection_orphaned_items_terminal_check CHECK (
        (
            status IN ('pending_revocation', 'pending_reconciliation', 'exhausted')
            AND revoked_at IS NULL
            AND encrypted_access_token IS NOT NULL
        )
        OR (
            status IN ('revoked', 'reconciled', 'abandoned')
            AND revoked_at IS NOT NULL
            AND encrypted_access_token IS NULL
        )
    );

DROP INDEX IF EXISTS idx_bank_connection_orphaned_items_open;
CREATE INDEX idx_bank_connection_revocation_due
    ON bank_connection_orphaned_items (next_attempt_at, created_at, id)
    WHERE status IN ('pending_revocation', 'pending_reconciliation');
CREATE INDEX idx_bank_connection_revocation_exhausted
    ON bank_connection_orphaned_items (retain_until, created_at)
    WHERE status = 'exhausted';
CREATE UNIQUE INDEX idx_bank_connection_revocation_open_connection
    ON bank_connection_orphaned_items (connection_id)
    WHERE connection_id IS NOT NULL
      AND status IN ('pending_revocation', 'pending_reconciliation', 'exhausted');
CREATE UNIQUE INDEX idx_bank_connection_revocation_dedupe
    ON bank_connection_orphaned_items (dedupe_key)
    WHERE dedupe_key IS NOT NULL
      AND status IN ('pending_revocation', 'pending_reconciliation', 'exhausted');

COMMENT ON TABLE bank_connection_orphaned_items IS
    'Server-only durable provider-revocation outbox (#4405), evolved from the '
    'Stage 6 orphan handoff. Contains only provider, encrypted minimum '
    'revocation credential, retry/disposition state, and temporary beneficiary '
    'references needed before erasure. Erasure atomically nulls every identity '
    'reference. Never client-readable, PowerSync-delivered, exported, or logged.';

-- -----------------------------------------------------------------------------
-- Explicit downgrade selection
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.select_bank_connections_for_downgrade(
    p_household_id UUID,
    p_actor_id UUID,
    p_target_tier TEXT,
    p_selected_connection_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS TABLE (status TEXT, selected_count BIGINT, target_allowance BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_source_tier TEXT;
    v_source_expiry TIMESTAMPTZ;
    v_target_allowance BIGINT;
    v_live_count BIGINT;
    v_selected_count BIGINT;
    v_distinct_count BIGINT;
    v_valid_count BIGINT;
BEGIN
    IF p_target_tier NOT IN ('free', 'plus', 'premium') THEN
        RETURN QUERY SELECT 'invalid_transition'::TEXT, 0::BIGINT, 0::BIGINT;
        RETURN;
    END IF;

    IF NOT (
        EXISTS (
            SELECT 1
            FROM household_members m
            WHERE m.household_id = p_household_id
              AND m.user_id = p_actor_id
              AND m.deleted_at IS NULL
              AND m.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1
            FROM households h
            WHERE h.id = p_household_id
              AND h.created_by = p_actor_id
              AND h.deleted_at IS NULL
        )
    ) THEN
        RETURN QUERY SELECT 'forbidden'::TEXT, 0::BIGINT, 0::BIGINT;
        RETURN;
    END IF;

    SELECT display_tier, expires_at
    INTO v_source_tier, v_source_expiry
    FROM current_household_entitlements
    WHERE household_id = p_household_id;

    IF NOT FOUND OR v_source_tier = 'free'
       OR v_source_expiry IS NULL OR v_source_expiry <= statement_timestamp() THEN
        RETURN QUERY SELECT 'entitlement_unavailable'::TEXT, 0::BIGINT, 0::BIGINT;
        RETURN;
    END IF;

    IF NOT (
        (v_source_tier = 'family' AND p_target_tier IN ('premium', 'plus', 'free'))
        OR (v_source_tier = 'premium' AND p_target_tier IN ('plus', 'free'))
    ) THEN
        RETURN QUERY SELECT 'invalid_transition'::TEXT, 0::BIGINT, 0::BIGINT;
        RETURN;
    END IF;

    -- Catalog-v1 downgrade limits. Family -> Premium intentionally retains at
    -- most two even if an add-on is later activated.
    v_target_allowance := CASE WHEN p_target_tier = 'premium' THEN 2 ELSE 0 END;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    SELECT count(*) INTO v_live_count
    FROM bank_connections c
    WHERE c.household_id = p_household_id
      AND c.deleted_at IS NULL
      AND c.status NOT IN ('disconnected', 'revocation_pending');

    SELECT count(*), count(DISTINCT selected_id)
    INTO v_selected_count, v_distinct_count
    FROM unnest(COALESCE(p_selected_connection_ids, '{}'::UUID[])) selected_id;

    SELECT count(*) INTO v_valid_count
    FROM bank_connections c
    WHERE c.household_id = p_household_id
      AND c.deleted_at IS NULL
      AND c.status NOT IN ('disconnected', 'revocation_pending')
      AND c.id = ANY(COALESCE(p_selected_connection_ids, '{}'::UUID[]));

    IF v_selected_count <> LEAST(v_live_count, v_target_allowance)
       OR v_selected_count <> v_distinct_count
       OR v_selected_count <> v_valid_count THEN
        RETURN QUERY SELECT 'invalid_selection'::TEXT, v_selected_count, v_target_allowance;
        RETURN;
    END IF;

    INSERT INTO bank_connection_retention_selections (
        household_id,
        actor_id,
        source_tier,
        target_tier,
        target_allowance,
        selected_connection_ids,
        expires_at
    )
    VALUES (
        p_household_id,
        p_actor_id,
        v_source_tier,
        p_target_tier,
        v_target_allowance,
        COALESCE(p_selected_connection_ids, '{}'::UUID[]),
        LEAST(now() + interval '30 days', v_source_expiry)
    )
    ON CONFLICT (household_id) DO UPDATE
    SET actor_id = EXCLUDED.actor_id,
        source_tier = EXCLUDED.source_tier,
        target_tier = EXCLUDED.target_tier,
        target_allowance = EXCLUDED.target_allowance,
        selected_connection_ids = EXCLUDED.selected_connection_ids,
        created_at = now(),
        expires_at = LEAST(now() + interval '30 days', v_source_expiry);

    RETURN QUERY SELECT 'selected'::TEXT, v_selected_count, v_target_allowance;
END;
$$;

-- -----------------------------------------------------------------------------
-- Transactional enqueue boundaries
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.enqueue_bank_connection_revocation(
    p_connection_id UUID,
    p_actor_id UUID,
    p_reason TEXT DEFAULT 'disconnect'
)
RETURNS TABLE (status TEXT, outbox_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID;
    v_connection bank_connections%ROWTYPE;
    v_outbox_id UUID;
BEGIN
    IF p_reason NOT IN ('disconnect', 'account_deletion') THEN
        RAISE EXCEPTION 'invalid revocation reason' USING ERRCODE = 'check_violation';
    END IF;

    SELECT household_id INTO v_household_id
    FROM bank_connections
    WHERE id = p_connection_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(v_household_id));

    SELECT * INTO v_connection
    FROM bank_connections
    WHERE id = p_connection_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF NOT (
        EXISTS (
            SELECT 1 FROM household_members m
            WHERE m.household_id = v_connection.household_id
              AND m.user_id = p_actor_id
              AND m.deleted_at IS NULL
              AND m.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM households h
            WHERE h.id = v_connection.household_id
              AND h.created_by = p_actor_id
              AND h.deleted_at IS NULL
        )
    ) THEN
        RETURN QUERY SELECT 'forbidden'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF v_connection.encrypted_access_token IS NULL
       OR btrim(v_connection.encrypted_access_token) = '' THEN
        RAISE EXCEPTION 'connection has no revocation credential'
            USING ERRCODE = 'not_null_violation';
    END IF;

    SELECT id INTO v_outbox_id
    FROM bank_connection_orphaned_items o
    WHERE o.dedupe_key = digest(p_connection_id::TEXT, 'sha256')
      AND o.status IN ('pending_revocation', 'pending_reconciliation', 'exhausted')
    FOR UPDATE;

    IF v_outbox_id IS NULL THEN
        INSERT INTO bank_connection_orphaned_items (
            household_id,
            owner_id,
            connection_id,
            provider,
            encrypted_access_token,
            status,
            attempts,
            last_error_code,
            source_reason,
            next_attempt_at,
            dedupe_key
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
            now(),
            digest(v_connection.id::TEXT, 'sha256')
        )
        RETURNING id INTO v_outbox_id;
    END IF;

    UPDATE bank_connections
    SET status = 'revocation_pending',
        error_code = NULL,
        error_message = NULL
    WHERE id = p_connection_id;

    RETURN QUERY SELECT 'enqueued'::TEXT, v_outbox_id;
END;
$$;

CREATE FUNCTION public.enqueue_bank_revocations_for_erasure(
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
    v_enqueued BIGINT;
BEGIN
    -- Match the account-delete ownership plan: all Items in sole households,
    -- plus this user's Items in shared households. Lock households in stable
    -- order so concurrent downgrade/disconnect/deletion cannot deadlock.
    FOR v_household_id IN
        SELECT DISTINCT c.household_id
        FROM bank_connections c
        WHERE c.deleted_at IS NULL
          AND c.status <> 'disconnected'
          AND (
              c.owner_id = p_owner_id
              OR (p_household_ids IS NOT NULL AND c.household_id = ANY(p_household_ids))
          )
        ORDER BY c.household_id
    LOOP
        PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(v_household_id));
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM bank_connections c
        WHERE c.deleted_at IS NULL
          AND c.status <> 'disconnected'
          AND (
              c.owner_id = p_owner_id
              OR (p_household_ids IS NOT NULL AND c.household_id = ANY(p_household_ids))
          )
          AND (
              c.encrypted_access_token IS NULL
              OR btrim(c.encrypted_access_token) = ''
          )
    ) THEN
        RAISE EXCEPTION 'a deleting connection has no revocation credential'
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
        source_reason,
        next_attempt_at,
        erasure_requested_at,
        retain_until,
        dedupe_key
    )
    SELECT
        c.household_id,
        c.owner_id,
        c.id,
        c.provider,
        c.encrypted_access_token,
        'pending_revocation',
        0,
        'account_deletion',
        now(),
        now(),
        now() + interval '7 days',
        digest(c.id::TEXT, 'sha256')
    FROM bank_connections c
    WHERE c.deleted_at IS NULL
      AND c.status <> 'disconnected'
      AND (
          c.owner_id = p_owner_id
          OR (p_household_ids IS NOT NULL AND c.household_id = ANY(p_household_ids))
      )
      AND NOT EXISTS (
          SELECT 1
          FROM bank_connection_orphaned_items o
          WHERE o.dedupe_key = digest(c.id::TEXT, 'sha256')
            AND o.status IN ('pending_revocation', 'pending_reconciliation', 'exhausted')
      );

    GET DIAGNOSTICS v_enqueued = ROW_COUNT;

    UPDATE bank_connections c
    SET status = 'revocation_pending'
    WHERE c.deleted_at IS NULL
      AND c.status <> 'disconnected'
      AND (
          c.owner_id = p_owner_id
          OR (p_household_ids IS NOT NULL AND c.household_id = ANY(p_household_ids))
      );

    -- Account deletion continues immediately. Remove every durable beneficiary
    -- identifier while preserving only the encrypted minimum provider
    -- credential and secret-safe retry/audit state.
    UPDATE bank_connection_orphaned_items o
    SET status = CASE
            WHEN o.status = 'pending_reconciliation' THEN 'pending_revocation'
            ELSE o.status
        END,
        source_reason = 'account_deletion',
        erasure_requested_at = COALESCE(o.erasure_requested_at, now()),
        retain_until = LEAST(o.retain_until, now() + interval '7 days'),
        household_id = NULL,
        owner_id = NULL,
        connection_id = NULL
    WHERE (
          o.owner_id = p_owner_id
          OR (p_household_ids IS NOT NULL AND o.household_id = ANY(p_household_ids))
          OR EXISTS (
              SELECT 1
              FROM bank_connections c
              WHERE c.id = o.connection_id
                AND c.deleted_at IS NULL
                AND c.status <> 'disconnected'
                AND (
                    c.owner_id = p_owner_id
                    OR (p_household_ids IS NOT NULL AND c.household_id = ANY(p_household_ids))
                )
          )
      );

    RETURN v_enqueued;
END;
$$;

-- -----------------------------------------------------------------------------
-- Downgrade application
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.reconcile_bank_connections_to_allowance(
    p_household_id UUID,
    p_source_tier TEXT DEFAULT NULL,
    p_target_tier TEXT DEFAULT NULL,
    p_target_allowance BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_allowance BIGINT;
    v_live_count BIGINT;
    v_keep_count BIGINT;
    v_selection bank_connection_retention_selections%ROWTYPE;
    v_selected_valid BOOLEAN := false;
    v_excess UUID[];
    v_enqueued BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    v_allowance := COALESCE(p_target_allowance, bank_connection_cap_for_household(p_household_id));
    IF p_source_tier = 'family' AND p_target_tier = 'premium' THEN
        v_allowance := LEAST(v_allowance, 2);
    END IF;

    SELECT count(*) INTO v_live_count
    FROM bank_connections
    WHERE household_id = p_household_id
      AND deleted_at IS NULL
      AND status NOT IN ('disconnected', 'revocation_pending');

    IF v_live_count <= v_allowance THEN
        RETURN 0;
    END IF;

    v_keep_count := LEAST(v_live_count, GREATEST(v_allowance, 0));

    SELECT * INTO v_selection
    FROM bank_connection_retention_selections s
    WHERE s.household_id = p_household_id
      AND s.expires_at > statement_timestamp()
      AND (p_source_tier IS NULL OR s.source_tier = p_source_tier)
      AND s.target_allowance = v_keep_count
      AND (
          (p_target_tier = 'premium' AND s.target_tier = 'premium')
          OR (p_target_tier = 'free' AND s.target_tier IN ('free', 'plus'))
          OR (p_target_tier = 'plus' AND s.target_tier IN ('free', 'plus'))
          OR p_target_tier IS NULL
      )
      AND (
          EXISTS (
              SELECT 1
              FROM household_members m
              WHERE m.household_id = p_household_id
                AND m.user_id = s.actor_id
                AND m.deleted_at IS NULL
                AND m.role IN ('owner', 'admin')
          )
          OR EXISTS (
              SELECT 1
              FROM households h
              WHERE h.id = p_household_id
                AND h.created_by = s.actor_id
                AND h.deleted_at IS NULL
          )
      )
    FOR UPDATE;

    IF FOUND
       AND cardinality(v_selection.selected_connection_ids) = v_keep_count
       AND (
           SELECT count(DISTINCT selected_id)
           FROM unnest(v_selection.selected_connection_ids) selected_id
       ) = v_keep_count
       AND (
           SELECT count(*)
           FROM bank_connections c
           WHERE c.household_id = p_household_id
             AND c.deleted_at IS NULL
             AND c.status NOT IN ('disconnected', 'revocation_pending')
             AND c.id = ANY(v_selection.selected_connection_ids)
       ) = v_keep_count THEN
        v_selected_valid := true;
    END IF;

    SELECT array_agg(id ORDER BY created_at, id) INTO v_excess
    FROM (
        SELECT c.id, c.created_at,
               row_number() OVER (ORDER BY c.created_at, c.id) AS fallback_rank
        FROM bank_connections c
        WHERE c.household_id = p_household_id
          AND c.deleted_at IS NULL
          AND c.status NOT IN ('disconnected', 'revocation_pending')
    ) ranked
    WHERE CASE
        WHEN v_selected_valid THEN NOT (id = ANY(v_selection.selected_connection_ids))
        ELSE fallback_rank > v_keep_count
    END;

    IF COALESCE(cardinality(v_excess), 0) = 0 THEN
        DELETE FROM bank_connection_retention_selections WHERE household_id = p_household_id;
        RETURN 0;
    END IF;

    INSERT INTO bank_connection_orphaned_items (
        household_id,
        owner_id,
        connection_id,
        provider,
        encrypted_access_token,
        status,
        attempts,
        source_reason,
        next_attempt_at,
        dedupe_key
    )
    SELECT
        c.household_id,
        c.owner_id,
        c.id,
        c.provider,
        c.encrypted_access_token,
        'pending_revocation',
        0,
        'downgrade',
        now(),
        digest(c.id::TEXT, 'sha256')
    FROM bank_connections c
    WHERE c.id = ANY(v_excess)
      AND c.encrypted_access_token IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM bank_connection_orphaned_items o
          WHERE o.dedupe_key = digest(c.id::TEXT, 'sha256')
            AND o.status IN ('pending_revocation', 'pending_reconciliation', 'exhausted')
      );

    GET DIAGNOSTICS v_enqueued = ROW_COUNT;

    IF EXISTS (
        SELECT 1 FROM bank_connections c
        WHERE c.id = ANY(v_excess) AND c.encrypted_access_token IS NULL
    ) THEN
        RAISE EXCEPTION 'an excess connection has no revocation credential'
            USING ERRCODE = 'not_null_violation';
    END IF;

    UPDATE bank_connections
    SET status = 'revocation_pending',
        error_code = NULL,
        error_message = NULL
    WHERE id = ANY(v_excess);

    DELETE FROM bank_connection_retention_selections WHERE household_id = p_household_id;
    RETURN v_enqueued;
END;
$$;

CREATE FUNCTION public.reconcile_bank_connections_after_entitlement_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR NEW.bank_connection_allowance < OLD.bank_connection_allowance
       OR (OLD.display_tier = 'family' AND NEW.display_tier = 'premium')
       OR (
           OLD.display_tier = 'premium'
           AND NEW.display_tier IN ('free', 'plus')
       ) THEN
        PERFORM reconcile_bank_connections_to_allowance(
            NEW.household_id,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.display_tier ELSE NULL END,
            NEW.display_tier,
            NEW.bank_connection_allowance
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_household_entitlement_bank_revocation
    AFTER INSERT OR UPDATE OF bank_connection_allowance, display_tier
    ON current_household_entitlements
    FOR EACH ROW
    EXECUTE FUNCTION reconcile_bank_connections_after_entitlement_change();

CREATE FUNCTION public.reconcile_all_bank_connection_allowances(p_limit INTEGER DEFAULT 100)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID;
    v_total BIGINT := 0;
BEGIN
    FOR v_household IN
        SELECT c.household_id
        FROM bank_connections c
        WHERE c.deleted_at IS NULL
          AND c.status NOT IN ('disconnected', 'revocation_pending')
        GROUP BY c.household_id
        HAVING count(*) > bank_connection_cap_for_household(c.household_id)
        ORDER BY c.household_id
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000)
    LOOP
        v_total := v_total + reconcile_bank_connections_to_allowance(v_household);
    END LOOP;
    RETURN v_total;
END;
$$;

-- -----------------------------------------------------------------------------
-- Leased worker state machine
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.claim_bank_revocation_jobs(
    p_worker_id UUID,
    p_limit INTEGER DEFAULT 25,
    p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
    id UUID,
    provider TEXT,
    encrypted_access_token TEXT,
    status TEXT,
    connection_id UUID,
    source_reason TEXT,
    attempts INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH claimable AS (
        SELECT o.id
        FROM bank_connection_orphaned_items o
        WHERE o.status IN ('pending_revocation', 'pending_reconciliation')
          AND o.next_attempt_at <= statement_timestamp()
          AND (o.claim_expires_at IS NULL OR o.claim_expires_at <= statement_timestamp())
          AND o.attempts < o.max_attempts
        ORDER BY o.next_attempt_at, o.created_at, o.id
        FOR UPDATE SKIP LOCKED
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
    )
    UPDATE bank_connection_orphaned_items o
    SET claimed_by = p_worker_id,
        claim_expires_at = statement_timestamp()
            + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 30), 900)),
        attempts = o.attempts + 1
    FROM claimable c
    WHERE o.id = c.id
    RETURNING
        o.id,
        o.provider,
        o.encrypted_access_token,
        o.status,
        o.connection_id,
        o.source_reason,
        o.attempts;
$$;

CREATE FUNCTION public.resolve_bank_revocation_reconciliation(
    p_id UUID,
    p_worker_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item bank_connection_orphaned_items%ROWTYPE;
    v_connection_live BOOLEAN;
BEGIN
    SELECT * INTO v_item
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND claimed_by = p_worker_id
      AND claim_expires_at > statement_timestamp()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'stale_claim';
    END IF;
    IF v_item.status <> 'pending_reconciliation' THEN
        RETURN 'revoke';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM bank_connections c
        WHERE c.id = v_item.connection_id
          AND c.deleted_at IS NULL
          AND c.status <> 'revocation_pending'
    ) INTO v_connection_live;

    IF v_connection_live THEN
        UPDATE bank_connection_orphaned_items
        SET status = 'reconciled',
            encrypted_access_token = NULL,
            revoked_at = now(),
            claimed_by = NULL,
            claim_expires_at = NULL,
            last_error_code = 'FINALIZATION_CONFIRMED'
        WHERE id = p_id;
        RETURN 'retained';
    END IF;

    UPDATE bank_connection_orphaned_items
    SET status = 'pending_revocation'
    WHERE id = p_id;
    RETURN 'revoke';
END;
$$;

CREATE FUNCTION public.complete_bank_revocation_job(
    p_id UUID,
    p_worker_id UUID,
    p_already_invalid BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_connection_id UUID;
BEGIN
    SELECT connection_id INTO v_connection_id
    FROM bank_connection_orphaned_items
    WHERE id = p_id
      AND status = 'pending_revocation'
      AND claimed_by = p_worker_id
      AND claim_expires_at > statement_timestamp()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE bank_connection_orphaned_items
    SET status = 'revoked',
        encrypted_access_token = NULL,
        revoked_at = now(),
        claimed_by = NULL,
        claim_expires_at = NULL,
        next_attempt_at = now(),
        last_error_code = CASE
            WHEN p_already_invalid THEN 'ALREADY_INVALID'
            ELSE NULL
        END
    WHERE id = p_id;

    IF v_connection_id IS NOT NULL THEN
        UPDATE bank_connections
        SET status = 'disconnected',
            encrypted_access_token = NULL,
            deleted_at = COALESCE(deleted_at, now()),
            error_code = NULL,
            error_message = NULL
        WHERE id = v_connection_id
          AND status = 'revocation_pending';
    END IF;

    RETURN true;
END;
$$;

CREATE FUNCTION public.fail_bank_revocation_job(
    p_id UUID,
    p_worker_id UUID,
    p_error_code TEXT
)
RETURNS TABLE (status TEXT, next_attempt_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item bank_connection_orphaned_items%ROWTYPE;
    v_delay_seconds DOUBLE PRECISION;
BEGIN
    IF p_error_code IS NULL
       OR p_error_code !~ '^[A-Z0-9][A-Z0-9_:-]{0,127}$' THEN
        RAISE EXCEPTION 'invalid safe error code' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_item
    FROM bank_connection_orphaned_items o
    WHERE o.id = p_id
      AND o.status IN ('pending_revocation', 'pending_reconciliation')
      AND o.claimed_by = p_worker_id
      AND o.claim_expires_at > statement_timestamp()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'stale_claim'::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF v_item.attempts >= v_item.max_attempts THEN
        UPDATE bank_connection_orphaned_items
        SET status = 'exhausted',
            last_error_code = p_error_code,
            claimed_by = NULL,
            claim_expires_at = NULL
        WHERE id = p_id;
        RETURN QUERY SELECT 'exhausted'::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    -- 30 seconds * 2^(attempt-1), capped at 6 hours, with deterministic
    -- per-job/per-attempt jitter in [0.75, 1.25). Deterministic jitter makes
    -- retries testable while still dispersing workers after an outage.
    v_delay_seconds := LEAST(21600::DOUBLE PRECISION, 30 * power(2, v_item.attempts - 1))
        * (
            0.75
            + (
                mod(
                    hashtextextended(v_item.id::TEXT || ':' || v_item.attempts::TEXT, 4405),
                    5000
                ) + 5000
            ) % 5000 / 10000.0
        );

    UPDATE bank_connection_orphaned_items
    SET last_error_code = p_error_code,
        next_attempt_at = statement_timestamp()
            + make_interval(secs => CEIL(v_delay_seconds)::INTEGER),
        claimed_by = NULL,
        claim_expires_at = NULL
    WHERE id = p_id
    RETURNING bank_connection_orphaned_items.status,
              bank_connection_orphaned_items.next_attempt_at
    INTO status, next_attempt_at;

    RETURN NEXT;
END;
$$;

CREATE FUNCTION public.bank_revocation_reconciliation_status()
RETURNS TABLE (
    status TEXT,
    last_error_code TEXT,
    job_count BIGINT,
    oldest_created_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        o.status,
        o.last_error_code,
        count(*),
        min(o.created_at),
        min(o.next_attempt_at)
    FROM bank_connection_orphaned_items o
    WHERE o.status IN ('pending_revocation', 'pending_reconciliation', 'exhausted', 'abandoned')
    GROUP BY o.status, o.last_error_code
    ORDER BY o.status, o.last_error_code NULLS FIRST;
$$;

-- Keep the Stage 6 recorder, but initialize worker scheduling fields and make
-- duplicate delivery idempotent on the caller-generated connection id.
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
        RAISE EXCEPTION 'an orphan handoff must be recorded in an open status'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_encrypted_access_token IS NULL OR btrim(p_encrypted_access_token) = '' THEN
        RAISE EXCEPTION 'encrypted access token is required to retain revocation capability'
            USING ERRCODE = 'not_null_violation';
    END IF;

    IF p_connection_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('bank-revocation:' || p_connection_id::TEXT, 4405)
        );
        SELECT id INTO v_id
        FROM bank_connection_orphaned_items
        WHERE connection_id = p_connection_id
          AND status IN ('pending_revocation', 'pending_reconciliation', 'exhausted');
        IF v_id IS NOT NULL THEN
            RETURN v_id;
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
        last_error_code,
        source_reason,
        next_attempt_at,
        dedupe_key
    )
    VALUES (
        p_household_id,
        p_owner_id,
        p_connection_id,
        p_provider,
        p_encrypted_access_token,
        p_status,
        1,
        p_last_error_code,
        'finalization',
        now(),
        CASE
            WHEN p_connection_id IS NULL THEN NULL
            ELSE digest(p_connection_id::TEXT, 'sha256')
        END
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Extend the Stage 6 purge to exhausted rows and remove all identity remnants
-- from terminal records.
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
            last_error_code = COALESCE(last_error_code, 'RETENTION_EXPIRED'),
            claimed_by = NULL,
            claim_expires_at = NULL,
            household_id = NULL,
            owner_id = NULL,
            connection_id = NULL
        WHERE status IN ('pending_revocation', 'pending_reconciliation', 'exhausted')
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

-- Least privilege: the service worker and authenticated request handlers use
-- the service-role client; clients cannot execute or inspect any outbox RPC.
REVOKE EXECUTE ON FUNCTION public.select_bank_connections_for_downgrade(UUID, UUID, TEXT, UUID[])
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_bank_revocations_for_erasure(UUID, UUID[])
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_bank_connections_to_allowance(UUID, TEXT, TEXT, BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_all_bank_connection_allowances(INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_bank_revocation_jobs(UUID, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_bank_revocation_reconciliation(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_bank_revocation_job(UUID, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_bank_revocation_job(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bank_revocation_reconciliation_status()
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.select_bank_connections_for_downgrade(UUID, UUID, TEXT, UUID[])
    TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_bank_connection_revocation(UUID, UUID, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_bank_revocations_for_erasure(UUID, UUID[])
    TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_connections_to_allowance(UUID, TEXT, TEXT, BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_all_bank_connection_allowances(INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_bank_revocation_jobs(UUID, INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_bank_revocation_reconciliation(UUID, UUID)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_bank_revocation_job(UUID, UUID, BOOLEAN)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_bank_revocation_job(UUID, UUID, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.bank_revocation_reconciliation_status()
    TO service_role;

-- Trigger functions and internal helpers are never caller surfaces.
REVOKE EXECUTE ON FUNCTION public.reconcile_bank_connections_after_entitlement_change()
    FROM PUBLIC, anon, authenticated;
