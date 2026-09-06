-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Migration: 20260906000003_bank_connection_cap_entitlement
-- Description: Tier-aware, concurrency-safe bank connection caps (#4404)
-- =============================================================================
-- Stage 6 of the server-authoritative entitlement program. Replaces the flat
-- per-household cap of 2 (20260403000001_bank_connection_cap.sql) and the
-- count-then-create flow in `bank-connection` with a single documented rule
-- backed only by the current entitlement projection, plus an atomic
-- reservation design that cannot race past the resolved allowance.
--
-- ONE DOCUMENTED RULE
--   `bank_connection_cap_for_household(household_id)` is the sole allowance
--   source. It reads `current_household_entitlements.bank_connection_allowance`
--   (Stage 5, 20260906000001) — the minimized Finance projection — and never a
--   client tier, feature flag, cached response, or requested cap. The Edge
--   Function and the database boundary trigger both resolve the cap through
--   this one function, so they cannot disagree.
--
--   The projection already encodes the ratified allowance contract and its
--   non-stacking rule: Free 0, Plus 0 (Plus is a user tier and grants no
--   household bank allowance), Premium 2 plus only verified active add-on
--   Items, and Family 4 bound to its one household. The projection selects the
--   single maximum eligible source and never sums across sponsors, so personal,
--   sponsored-household, Family, and add-on allowances do not stack here either.
--
-- ATOMIC RESERVATION (no count-then-insert race)
--   A billable aggregator Item is created by the provider BEFORE we can persist
--   its row. To keep concurrent requests from all observing the same free slot
--   and each creating an Item, capacity is claimed up front:
--     1. `reserve_bank_connection_slot` takes a per-household advisory lock,
--        counts live rows PLUS unexpired reservations, and — only if there is
--        room under the resolved cap — writes a short-lived reservation. The
--        provider exchange runs after a reservation is held.
--     2. `finalize_bank_connection_reservation` retakes the same lock, consumes
--        the reservation, re-derives capacity without it, and inserts the
--        connection row in the same transaction.
--   Live rows plus unexpired reservations are the consumed count everywhere, so
--   a direct writer cannot steal a slot another request has reserved, and a
--   finalize never counts the reservation it is consuming.
--
-- LOCK ORDER
--   The advisory lock class is salted distinctly from the billing ledger's
--   `billing_accounts` row locks, and this subsystem only READS the committed
--   projection (it never locks billing rows). There is therefore no lock-order
--   inversion with the entitlement ledger. Membership is resolved before the
--   lock is taken.
--
-- FAIL CLOSED
--   A household with no projection row resolves to 0. A projection or
--   authorization failure raises rather than defaulting to any positive cap.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Per-household advisory lock key for the reservation subsystem.
-- Salted (4404) so it is disjoint from every billing-ledger lock class.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.bank_connection_reservation_lock_key(p_household_id UUID)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT hashtextextended(
        'bank_connection_reservation' || chr(31) || p_household_id::text,
        4404
    );
$$;

COMMENT ON FUNCTION public.bank_connection_reservation_lock_key(UUID) IS
    'Transaction advisory-lock key serializing bank connection reservations, '
    'finalizations, and direct writers per household. Salt 4404 keeps this lock '
    'class disjoint from the billing ledger locks. See #4404.';

-- -----------------------------------------------------------------------------
-- The one allowance rule. Reads only the minimized Finance projection.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.bank_connection_cap_for_household(p_household_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT bank_connection_allowance
            FROM current_household_entitlements
            WHERE household_id = p_household_id
        ),
        0::BIGINT
    );
$$;

COMMENT ON FUNCTION public.bank_connection_cap_for_household(UUID) IS
    'Sole bank connection allowance rule (#4404). Returns the household bank '
    'allowance from the minimized entitlement projection (Stage 5); 0 when no '
    'projection row exists. Never trusts a client tier, flag, cache, or '
    'requested cap. The Edge Function and the cap trigger both resolve through '
    'this function so they cannot disagree.';

-- -----------------------------------------------------------------------------
-- Server-only expiring reservations. One unexpired row holds one slot while a
-- provider exchange is in flight. Excluded from PowerSync; no client access.
-- -----------------------------------------------------------------------------
CREATE TABLE bank_connection_reservations (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    owner_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider      TEXT        NOT NULL
                  CONSTRAINT bank_connection_reservations_provider_valid
                      CHECK (provider IN ('plaid', 'mx')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,

    CONSTRAINT bank_connection_reservations_window_check
        CHECK (expires_at > created_at)
);

-- Supports the live+reserved capacity counts and expiry housekeeping.
CREATE INDEX idx_bank_connection_reservations_household
    ON bank_connection_reservations (household_id, expires_at);

COMMENT ON TABLE bank_connection_reservations IS
    'Server-only short-lived bank connection slot reservations (#4404). Each '
    'unexpired row reserves one slot while a provider exchange is in flight. '
    'Counted alongside live bank_connections when resolving remaining capacity. '
    'Never client-readable/writable and never PowerSync-delivered.';

-- -----------------------------------------------------------------------------
-- Durable handoff for a provider Item that became billable but could not be
-- finalized and could not be revoked immediately. The encrypted credential is
-- preserved so Stage 7 can retry an idempotent revocation. Server-only.
-- -----------------------------------------------------------------------------
CREATE TABLE bank_connection_orphaned_items (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id           UUID        REFERENCES households(id) ON DELETE SET NULL,
    owner_id               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    provider               TEXT        NOT NULL
                           CONSTRAINT bank_connection_orphaned_items_provider_valid
                               CHECK (provider IN ('plaid', 'mx')),
    -- AES-256-GCM envelope, never plaintext. Retained so revocation can retry.
    encrypted_access_token TEXT        NOT NULL,
    status                 TEXT        NOT NULL DEFAULT 'pending_revocation'
                           CONSTRAINT bank_connection_orphaned_items_status_valid
                               CHECK (status IN ('pending_revocation', 'revoked')),
    attempts               INTEGER     NOT NULL DEFAULT 0
                           CONSTRAINT bank_connection_orphaned_items_attempts_check
                               CHECK (attempts >= 0),
    -- Safe, non-sensitive revocation failure detail only (e.g. a provider
    -- error_code). NEVER a token, raw body, or financial data.
    last_error_code        TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at             TIMESTAMPTZ,

    CONSTRAINT bank_connection_orphaned_items_revoked_check CHECK (
        (status = 'revoked' AND revoked_at IS NOT NULL)
        OR (status = 'pending_revocation' AND revoked_at IS NULL)
    )
);

CREATE INDEX idx_bank_connection_orphaned_items_pending
    ON bank_connection_orphaned_items (created_at)
    WHERE status = 'pending_revocation';

CREATE TRIGGER trg_bank_connection_orphaned_items_updated_at
    BEFORE UPDATE ON bank_connection_orphaned_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE bank_connection_orphaned_items IS
    'Server-only durable handoff (#4404) for a provider Item that became '
    'billable but could not be finalized or immediately revoked. Retains the '
    'encrypted credential so Stage 7 can retry an idempotent revocation without '
    'losing the revocation capability. Never client-readable and never synced.';

-- =============================================================================
-- Reservation RPCs (server-only; service_role)
-- =============================================================================

-- Resolve membership, then claim one slot under the per-household advisory lock
-- if live rows + unexpired reservations are below the resolved cap.
CREATE FUNCTION public.reserve_bank_connection_slot(
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

    -- Membership is resolved BEFORE any lock, mirroring the Edge Function's
    -- authorization: an active owner/admin membership, or the household creator
    -- (whose membership row may still be uploading through PowerSync).
    SELECT
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
    INTO v_authorized;

    IF NOT v_authorized THEN
        RETURN QUERY SELECT 'forbidden'::TEXT, NULL::UUID, NULL::BIGINT, NULL::BIGINT,
                            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    -- Expired reservations never hold a slot.
    DELETE FROM bank_connection_reservations
    WHERE household_id = p_household_id
      AND bank_connection_reservations.expires_at <= now();

    v_cap := bank_connection_cap_for_household(p_household_id);

    SELECT count(*) INTO v_live
    FROM bank_connections
    WHERE household_id = p_household_id AND deleted_at IS NULL;

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

COMMENT ON FUNCTION public.reserve_bank_connection_slot(UUID, UUID, TEXT, INTEGER) IS
    'Atomically reserves one bank connection slot for a household under a '
    'per-household advisory lock (#4404). Returns reserved / premium_required / '
    'at_cap / forbidden. Counts live rows plus unexpired reservations; never '
    'trusts a client-supplied cap.';

-- Read-only capacity snapshot for the link-token courtesy pre-check. The
-- exchange path remains authoritative via reserve/finalize.
CREATE FUNCTION public.bank_connection_capacity(p_household_id UUID)
RETURNS TABLE (cap BIGINT, used BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        bank_connection_cap_for_household(p_household_id),
        (
            SELECT count(*) FROM bank_connections
            WHERE household_id = p_household_id AND deleted_at IS NULL
        )
        + (
            SELECT count(*) FROM bank_connection_reservations
            WHERE household_id = p_household_id AND expires_at > now()
        );
$$;

COMMENT ON FUNCTION public.bank_connection_capacity(UUID) IS
    'Read-only cap + consumed (live rows plus unexpired reservations) snapshot '
    'for the non-authoritative link-token pre-check (#4404).';

-- Consume a reservation and insert the connection row in one locked transaction.
CREATE FUNCTION public.finalize_bank_connection_reservation(
    p_reservation_id UUID,
    p_household_id UUID,
    p_owner_id UUID,
    p_provider TEXT,
    p_institution_id TEXT,
    p_institution_name TEXT,
    p_encrypted_access_token TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
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

    -- Clean up other expired reservations, but never the one being finalized —
    -- an expired reservation is still honoured when a slot is genuinely free.
    DELETE FROM bank_connection_reservations
    WHERE household_id = p_household_id
      AND expires_at <= now()
      AND id <> p_reservation_id;

    SELECT * INTO v_reservation
    FROM bank_connection_reservations
    WHERE id = p_reservation_id AND household_id = p_household_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'reservation_not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    -- Consume the reservation so it can never be counted against the insert
    -- below and can never be double-spent.
    DELETE FROM bank_connection_reservations WHERE id = p_reservation_id;

    -- Re-derive capacity WITHOUT the consumed reservation. If the slot was
    -- reclaimed while the provider exchange ran, reject so the caller revokes
    -- the now-orphaned billable Item.
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

COMMENT ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) IS
    'Consumes a reservation and inserts the bank connection row in one locked '
    'transaction (#4404). Returns finalized / at_cap / premium_required / '
    'reservation_not_found. On any non-finalized outcome the caller must revoke '
    'the provider Item.';

-- Release a reservation when the provider exchange itself fails, so the slot is
-- freed immediately rather than waiting for TTL expiry.
CREATE FUNCTION public.release_bank_connection_reservation(
    p_reservation_id UUID,
    p_household_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(p_household_id));

    DELETE FROM bank_connection_reservations
    WHERE id = p_reservation_id AND household_id = p_household_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted > 0;
END;
$$;

COMMENT ON FUNCTION public.release_bank_connection_reservation(UUID, UUID) IS
    'Releases an unconsumed reservation when the provider exchange fails (#4404).';

-- Durable handoff record for a billable Item that could not be finalized and
-- could not be revoked immediately. Preserves the encrypted credential.
CREATE FUNCTION public.record_orphaned_bank_item(
    p_household_id UUID,
    p_owner_id UUID,
    p_provider TEXT,
    p_encrypted_access_token TEXT,
    p_last_error_code TEXT DEFAULT NULL
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
    IF p_encrypted_access_token IS NULL OR btrim(p_encrypted_access_token) = '' THEN
        RAISE EXCEPTION 'encrypted access token is required to retain revocation capability'
            USING ERRCODE = 'not_null_violation';
    END IF;

    INSERT INTO bank_connection_orphaned_items (
        household_id,
        owner_id,
        provider,
        encrypted_access_token,
        attempts,
        last_error_code
    )
    VALUES (
        p_household_id,
        p_owner_id,
        p_provider,
        p_encrypted_access_token,
        1,
        p_last_error_code
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT) IS
    'Durably records a billable provider Item awaiting revocation retry (#4404), '
    'retaining its encrypted credential. Rejects an empty credential so the '
    'revocation capability is never lost.';

-- =============================================================================
-- Cap enforcement trigger — defense in depth for any direct writer
-- =============================================================================
-- Replaces the flat constant-2 body from 20260403000001. The invariant is now
-- "live rows + unexpired reservations <= the resolved projection cap" and holds
-- for any writer: the finalize RPC, a future function, a backfill, or a manual
-- service-role insert. A direct insert cannot steal a reserved slot because
-- unexpired reservations are counted; the finalize insert is not blocked by its
-- own reservation because it consumes (deletes) it first.
CREATE OR REPLACE FUNCTION enforce_bank_connection_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cap  BIGINT;
    v_used BIGINT;
BEGIN
    -- Only a row that is live on completion consumes allowance.
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- An UPDATE of a row that was already live is not a new Item.
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL
       AND OLD.household_id = NEW.household_id THEN
        RETURN NEW;
    END IF;

    -- Serialize with the reservation RPCs and other direct writers so two
    -- concurrent inserts cannot both observe the same free slot. Re-entrant
    -- within the finalize RPC, which already holds this lock.
    PERFORM pg_advisory_xact_lock(bank_connection_reservation_lock_key(NEW.household_id));

    v_cap := bank_connection_cap_for_household(NEW.household_id);

    SELECT
        (
            SELECT count(*) FROM bank_connections
            WHERE household_id = NEW.household_id
              AND deleted_at IS NULL
              AND id <> NEW.id
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

COMMENT ON FUNCTION enforce_bank_connection_cap() IS
    'Caps live bank_connections + unexpired reservations per household at the '
    'projection-resolved allowance (bank_connection_cap_for_household). Defense '
    'in depth behind the reservation RPCs; the single rule both boundaries '
    'share. See #4404 (supersedes the flat cap in #4379).';

-- The trigger event set is unchanged from 20260403000001; the replaced function
-- body above is what changes. Recreated defensively so a partial prior state
-- cannot leave the old wiring in place.
DROP TRIGGER IF EXISTS trg_bank_connections_cap ON bank_connections;
CREATE TRIGGER trg_bank_connections_cap
    BEFORE INSERT OR UPDATE OF household_id, deleted_at ON bank_connections
    FOR EACH ROW
    EXECUTE FUNCTION enforce_bank_connection_cap();

-- =============================================================================
-- RLS and least-privilege grants
-- =============================================================================
-- Both tables are server-only. Like the billing authority tables, they carry
-- no authenticated policies: the SECURITY DEFINER RPCs are the only surface.
ALTER TABLE bank_connection_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connection_orphaned_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE bank_connection_reservations, bank_connection_orphaned_items
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    bank_connection_reservations, bank_connection_orphaned_items
    TO service_role;

-- The cap/lock helpers and every reservation RPC are server-only.
REVOKE EXECUTE ON FUNCTION public.bank_connection_reservation_lock_key(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bank_connection_cap_for_household(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bank_connection_cap_for_household(UUID)
    TO service_role;
REVOKE EXECUTE ON FUNCTION public.bank_connection_capacity(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bank_connection_capacity(UUID)
    TO service_role;
REVOKE EXECUTE ON FUNCTION public.reserve_bank_connection_slot(UUID, UUID, TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_bank_connection_slot(UUID, UUID, TEXT, INTEGER)
    TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.release_bank_connection_reservation(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_bank_connection_reservation(UUID, UUID)
    TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT)
    TO service_role;

-- =============================================================================
-- Rollback (see down/20260906000003_bank_connection_cap_entitlement.down.sql)
-- =============================================================================
