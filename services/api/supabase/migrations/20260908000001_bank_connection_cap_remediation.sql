-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Migration: 20260908000001_bank_connection_cap_remediation
-- Description: Stage 6 remediation — expiry-aware cap, idempotent finalization,
--              and orphan credential lifecycle (Refs #4404)
-- =============================================================================
-- Post-merge review of 20260906000003 found three database-visible defects.
-- This migration fixes all three in the ONE authoritative path, so the Edge
-- Function, the capacity snapshot, and the direct-writer trigger continue to
-- resolve through exactly the same rule and cannot disagree.
--
-- 1. STALE PROJECTION EXPIRY (HIGH)
--    `bank_connection_cap_for_household` read
--    `current_household_entitlements.bank_connection_allowance` without
--    honouring the projection row's own `expires_at`. The projection is
--    refreshed by billing events and membership changes, not by a clock, so a
--    household whose entitlement has simply LAPSED keeps a positive allowance
--    row until something else triggers a refresh. In that window a lapsed
--    household could reserve and finalize a new billable Item — a recurring
--    monthly aggregator liability created with no live entitlement behind it.
--
--    The cap now ignores an expired projection row and resolves 0. It cannot
--    refresh the projection first: the cap is STABLE and is called from inside
--    the reservation advisory lock and from a BEFORE trigger, where a write to
--    the billing projection would both violate STABLE and invert the lock order
--    with the entitlement ledger. Failing closed is the correct, cheaper rule —
--    the entitlement refresh path re-populates the row, and until it does the
--    household resolves to `premium_required` rather than to free capacity.
--
-- 2. AMBIGUOUS FINALIZE OUTCOME (MEDIUM)
--    The caller treated EVERY finalize error as "no row was persisted" and
--    revoked the provider Item. An RPC can commit and still lose its response
--    (transport timeout, cancelled connection), in which case revoking destroys
--    the Item behind a live, persisted `bank_connections` row and leaves the
--    household with an unusable connection.
--
--    `finalize_bank_connection_reservation` now accepts a CALLER-GENERATED
--    connection id and is idempotent on it: replaying the same call after a
--    lost response returns the already-committed row instead of inserting a
--    second one or reporting a spurious rejection. `bank_connection_finalization_state`
--    gives the caller a definitive confirming read, so it can distinguish
--    "definitely rejected" (revoke) from "unknown" (never revoke).
--
-- 3. ORPHAN CREDENTIAL ERASURE / RETENTION (MEDIUM)
--    `bank_connection_orphaned_items` retained an encrypted provider credential
--    indefinitely, with `ON DELETE SET NULL` owner/household references and no
--    participation in account deletion. A deleted account could leave a live
--    provider credential at rest forever, with the erasure request never
--    propagated to the processor.
--
--    The row now has an explicit, bounded lifecycle: an open row keeps its
--    credential ONLY while revocation is still possible, a terminal row has its
--    credential purged in the same statement that marks it terminal, and every
--    open row carries a `retain_until` after which it is force-abandoned and
--    its credential destroyed. Account deletion claims the household's/user's
--    open rows so the credential is revoked at the processor before the
--    account's own data is removed, and shortens their retention window.
--
-- The reservation surface stays server-only: no new client-reachable grants,
-- no client-readable columns, and both tables remain excluded from PowerSync
-- (asserted by supabase/tests/sync-contract.test.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The one allowance rule — now expiry-aware and fail-closed.
-- -----------------------------------------------------------------------------
-- A free-tier projection row is `expires_at IS NULL` with allowance 0, so the
-- NULL branch keeps resolving to 0. A paid row always carries a non-null
-- `expires_at` (enforced by `current_household_entitlements_source_check`), so
-- an at-or-past expiry resolves to no row and therefore to 0.
--
-- `statement_timestamp()` matches the projection's own grant-window predicates
-- in 20260906000001, so an entitlement that is expired to the projection is
-- expired to the cap in the same statement.
CREATE OR REPLACE FUNCTION public.bank_connection_cap_for_household(p_household_id UUID)
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
              AND (expires_at IS NULL OR expires_at > statement_timestamp())
        ),
        0::BIGINT
    );
$$;

COMMENT ON FUNCTION public.bank_connection_cap_for_household(UUID) IS
    'Sole bank connection allowance rule (#4404). Returns the household bank '
    'allowance from the minimized entitlement projection (Stage 5), ignoring a '
    'projection row whose own expires_at has passed, and 0 when no live row '
    'exists. Never trusts a client tier, flag, cache, or requested cap. The '
    'Edge Function, the capacity snapshot, and the cap trigger all resolve '
    'through this function so they cannot disagree, and a lapsed entitlement '
    'fails closed rather than reserving another billable Item.';

-- -----------------------------------------------------------------------------
-- 2. Idempotent finalization keyed on a caller-generated connection id.
-- -----------------------------------------------------------------------------
-- Definitively answers "did finalization commit?" for one caller-generated id.
-- The caller uses this after an indeterminate finalize response, BEFORE it
-- decides whether revoking the provider Item is safe.
CREATE FUNCTION public.bank_connection_finalization_state(
    p_connection_id UUID,
    p_household_id UUID
)
RETURNS TABLE (state TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        CASE
            WHEN c.id IS NULL THEN 'absent'
            WHEN c.deleted_at IS NULL THEN 'finalized'
            ELSE 'disconnected'
        END,
        c.created_at
    FROM (SELECT 1) seed
    LEFT JOIN bank_connections c
        ON c.id = p_connection_id AND c.household_id = p_household_id;
$$;

COMMENT ON FUNCTION public.bank_connection_finalization_state(UUID, UUID) IS
    'Confirming read for a caller-generated bank connection id (#4404). '
    'Returns finalized / disconnected / absent so a caller whose finalize '
    'response was lost can tell a committed Item from an absent one and never '
    'revokes a provider Item that is already backing a persisted row.';

-- The 8-argument form is replaced by a 9-argument form that takes the
-- caller-generated id. The new parameter is last and defaults to NULL, so it is
-- a strict superset of the old call shape.
DROP FUNCTION IF EXISTS public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
);

CREATE FUNCTION public.finalize_bank_connection_reservation(
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

    -- Idempotent replay. A caller whose previous response was lost repeats the
    -- SAME connection id; if that attempt committed, report it as finalized
    -- rather than inserting a second billable row or returning a rejection that
    -- would make the caller revoke a live Item. Checked under the lock so it
    -- serializes against a concurrent finalize for the same id.
    IF p_connection_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM bank_connections
        WHERE id = p_connection_id AND household_id = p_household_id;

        IF FOUND THEN
            IF v_existing.deleted_at IS NULL THEN
                RETURN QUERY SELECT 'finalized'::TEXT, v_existing.id, v_existing.created_at;
            ELSE
                -- The row committed and was then disconnected (which already
                -- revoked and purged its credential). Definite rejection: the
                -- caller must not treat this as a live connection.
                RETURN QUERY SELECT 'already_disconnected'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
            END IF;
            RETURN;
        END IF;
    END IF;

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
    -- reclaimed while the provider exchange ran, or the entitlement lapsed,
    -- reject so the caller revokes the now-orphaned billable Item.
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

COMMENT ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID
) IS
    'Consumes a reservation and inserts the bank connection row in one locked '
    'transaction (#4404). Idempotent on the caller-generated p_connection_id: '
    'replaying a call whose response was lost returns the committed row. '
    'Returns finalized / at_cap / premium_required / reservation_not_found / '
    'already_disconnected. Only a DEFINITE non-finalized outcome means the '
    'caller must revoke the provider Item.';

-- -----------------------------------------------------------------------------
-- 3. Orphan credential lifecycle: bounded retention and terminal purge.
-- -----------------------------------------------------------------------------
-- `retain_until` is the hard ceiling on how long an encrypted provider
-- credential may sit in this table. Stage 7's durable outbox drains open rows
-- well inside that window; `purge_expired_orphaned_bank_items` is the backstop
-- that destroys the credential even if the outbox never succeeds, so the table
-- can never become an unbounded credential store.
ALTER TABLE bank_connection_orphaned_items
    ADD COLUMN connection_id         UUID,
    ADD COLUMN erasure_requested_at  TIMESTAMPTZ,
    ADD COLUMN retain_until          TIMESTAMPTZ NOT NULL
                                     DEFAULT (now() + interval '30 days'),
    ALTER COLUMN encrypted_access_token DROP NOT NULL;

-- `pending_reconciliation` is the outcome-unknown state: a provider Item exists
-- but we could not confirm whether its `bank_connections` row committed.
-- Stage 7 MUST resolve `connection_id` against `bank_connections` before
-- revoking such a row — revoking it blindly is exactly the defect this
-- migration removes from the request path.
ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT bank_connection_orphaned_items_status_valid;
ALTER TABLE bank_connection_orphaned_items
    ADD CONSTRAINT bank_connection_orphaned_items_status_valid CHECK (
        status IN ('pending_revocation', 'pending_reconciliation', 'revoked', 'abandoned')
    );

-- The credential exists ONLY while the row is open. Reaching a terminal state
-- and destroying the credential is a single atomic transition, so a terminal
-- row can never still hold provider access.
ALTER TABLE bank_connection_orphaned_items
    DROP CONSTRAINT bank_connection_orphaned_items_revoked_check;
ALTER TABLE bank_connection_orphaned_items
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

DROP INDEX IF EXISTS idx_bank_connection_orphaned_items_pending;
CREATE INDEX idx_bank_connection_orphaned_items_open
    ON bank_connection_orphaned_items (retain_until, created_at)
    WHERE status IN ('pending_revocation', 'pending_reconciliation');
CREATE INDEX idx_bank_connection_orphaned_items_terminal
    ON bank_connection_orphaned_items (revoked_at)
    WHERE status IN ('revoked', 'abandoned');
-- Account deletion resolves open rows by owner and by household.
CREATE INDEX idx_bank_connection_orphaned_items_owner
    ON bank_connection_orphaned_items (owner_id)
    WHERE status IN ('pending_revocation', 'pending_reconciliation');
CREATE INDEX idx_bank_connection_orphaned_items_household
    ON bank_connection_orphaned_items (household_id)
    WHERE status IN ('pending_revocation', 'pending_reconciliation');

COMMENT ON COLUMN bank_connection_orphaned_items.connection_id IS
    'The caller-generated bank_connections id this Item was being finalized '
    'as. Set for pending_reconciliation rows so the outcome can be resolved '
    'definitively before any revocation attempt (#4404).';
COMMENT ON COLUMN bank_connection_orphaned_items.erasure_requested_at IS
    'When the owning account requested deletion. Set by account deletion so '
    'processor revocation is propagated and retention is shortened (#4404).';
COMMENT ON COLUMN bank_connection_orphaned_items.retain_until IS
    'Hard ceiling on retaining the encrypted credential. Past this instant '
    'purge_expired_orphaned_bank_items abandons the row and destroys the '
    'credential even if revocation never succeeded (#4404).';
COMMENT ON COLUMN bank_connection_orphaned_items.revoked_at IS
    'Terminal disposition instant — set when the row reaches revoked or '
    'abandoned, in the same statement that clears the credential (#4404).';
COMMENT ON COLUMN bank_connection_orphaned_items.encrypted_access_token IS
    'AES-256-GCM envelope, never plaintext. Present only while the row is '
    'open; NULL once terminal. Never client-readable, never synced, never '
    'returned by a public API, and never logged (#4404).';

COMMENT ON TABLE bank_connection_orphaned_items IS
    'Server-only durable handoff (#4404) for a provider Item that became '
    'billable but could not be finalized, or whose finalization outcome could '
    'not be confirmed. Retains the encrypted credential ONLY while an open '
    'status makes revocation or reconciliation possible, and only until '
    'retain_until. Terminal rows hold no credential. Never client-readable and '
    'never synced.';

-- The recorder gains the connection id and the open status so the caller can
-- distinguish "definitely not persisted, revoke it" from "outcome unknown,
-- reconcile before revoking".
DROP FUNCTION IF EXISTS public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT);

CREATE FUNCTION public.record_orphaned_bank_item(
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

COMMENT ON FUNCTION public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID) IS
    'Durably records a billable provider Item awaiting revocation retry '
    '(pending_revocation) or outcome reconciliation (pending_reconciliation) '
    '(#4404), retaining its encrypted credential until retain_until. Rejects '
    'an empty credential so the revocation capability is never lost, and '
    'rejects a terminal status so a row can never be created already purged.';

-- Terminal disposition: mark the row done and destroy the credential in the
-- SAME statement. There is no path that leaves a terminal row holding a
-- credential, and no path that clears a credential while the row is still open.
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

COMMENT ON FUNCTION public.complete_orphaned_bank_item(UUID, TEXT, TEXT) IS
    'Moves an open orphan handoff to a terminal state and destroys its '
    'encrypted credential in the same statement (#4404). Idempotent: a row '
    'that is already terminal reports false and is left untouched.';

-- Revocation was attempted and failed. The row stays open — the credential is
-- the only remaining way to revoke — but the attempt is recorded so Stage 7 can
-- back off, and retention is still bounded by retain_until.
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

COMMENT ON FUNCTION public.record_orphaned_bank_item_attempt(UUID, TEXT) IS
    'Records a failed revocation attempt against an open orphan handoff '
    'without discarding the credential that is the only way to revoke (#4404).';

-- Account deletion entry point. Returns the account's open handoffs so the
-- caller can revoke them at the processor BEFORE the account's own rows are
-- deleted, and shortens their retention window so an unrevocable credential is
-- destroyed promptly rather than after the full default window.
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

COMMENT ON FUNCTION public.claim_orphaned_bank_items_for_erasure(UUID, UUID[]) IS
    'Marks a deleting account''s open orphan handoffs for erasure and returns '
    'them so the caller can revoke at the processor before the account is '
    'removed (#4404, GDPR Art. 17 processor propagation). Shortens retention '
    'to 7 days so a credential that cannot be revoked is still destroyed '
    'promptly. Service-role only — the credential never leaves the server.';

-- Bounded retention backstop. Two independent rules:
--   - An OPEN row past retain_until is force-abandoned and its credential is
--     destroyed, even though revocation never succeeded. Retaining a live
--     provider credential forever is the larger risk; the residual Item is
--     escalated through the abandoned status instead.
--   - A TERMINAL row (already credential-free) is deleted once its disposition
--     is older than the terminal retention window, so the audit trail is kept
--     long enough to investigate and no longer.
CREATE FUNCTION public.purge_expired_orphaned_bank_items(
    p_terminal_retention INTERVAL DEFAULT interval '90 days'
)
RETURNS TABLE (abandoned BIGINT, deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_abandoned BIGINT;
    v_deleted   BIGINT;
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

-- =============================================================================
-- Least-privilege grants — every new surface is server-only
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.bank_connection_finalization_state(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bank_connection_finalization_state(UUID, UUID)
    TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_orphaned_bank_item(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_orphaned_bank_item(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
) TO service_role;

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

REVOKE EXECUTE ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_orphaned_bank_items(INTERVAL)
    TO service_role;

-- =============================================================================
-- Retention enforcement — give the ceiling an actual caller
-- =============================================================================
-- `retain_until` is only a ceiling if something enforces it. A purge function
-- nobody calls leaves live provider credentials on disk indefinitely, which is
-- exactly the risk the ceiling exists to bound. It is therefore wired in twice,
-- deliberately:
--
--   1. Into `run_all_maintenance()`, the orchestrator the daily 3 AM UTC
--      `daily-maintenance` cron job already runs. This is the load-bearing
--      path: it works on any deployment where maintenance runs at all, and it
--      cannot be forgotten when the cron inventory is rebuilt.
--   2. As a dedicated `purge-orphaned-bank-items` cron job, so credential
--      expiry keeps being enforced even if the shared orchestrator is later
--      trimmed, fails partway through an earlier step, or is disabled.
--
-- Both calls are idempotent and cheap (two indexed predicates over a table
-- that is empty in the normal case), so running twice a day costs nothing and
-- double-execution is harmless.

-- Replaces the orchestrator from 20260330000005 to add the orphan purge. Every
-- prior step is preserved verbatim; only the bank-item purge is new.
CREATE OR REPLACE FUNCTION public.run_all_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate_limits    INTEGER;
    v_webauthn       INTEGER;
    v_sync_logs      INTEGER;
    v_invitations    INTEGER;
    v_audit_logs     INTEGER;
    v_bank_orphans   RECORD;
    v_analyze_result TEXT;
BEGIN
    -- Run each cleanup with default retention periods
    v_rate_limits    := cleanup_expired_rate_limits();
    v_webauthn       := cleanup_expired_webauthn_challenges();
    v_sync_logs      := cleanup_old_sync_health_logs();
    v_invitations    := cleanup_expired_invitations();
    v_audit_logs     := cleanup_old_audit_logs();

    -- Enforce the orphaned-credential retention ceiling (#4404). Counts only;
    -- no provider or credential values are returned.
    SELECT * INTO v_bank_orphans FROM purge_expired_orphaned_bank_items();

    -- Update planner statistics
    v_analyze_result := vacuum_analyze_tables();

    RETURN jsonb_build_object(
        'rate_limits_deleted',            v_rate_limits,
        'webauthn_challenges_deleted',    v_webauthn,
        'sync_health_logs_deleted',       v_sync_logs,
        'invitations_expired',            v_invitations,
        'audit_logs_deleted',             v_audit_logs,
        'bank_orphans_abandoned',         v_bank_orphans.abandoned,
        'bank_orphans_deleted',           v_bank_orphans.deleted,
        'analyze_result',                 v_analyze_result,
        'completed_at',                   NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;

-- Dedicated schedule, guarded exactly like the existing jobs: pg_cron ships on
-- Supabase Pro but not on free tier or local dev, so its absence must not fail
-- the migration.
DO $maint$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'purge-orphaned-bank-items',
            '15 4 * * *',
            $$SELECT public.purge_expired_orphaned_bank_items()$$
        );

        RAISE NOTICE 'pg_cron job scheduled: purge-orphaned-bank-items (daily 4:15 AM UTC)';
    ELSE
        RAISE NOTICE 'pg_cron not available — orphan retention runs via run_all_maintenance().';
    END IF;
END $maint$;

-- =============================================================================
-- Rollback (see down/20260908000001_bank_connection_cap_remediation.down.sql)
-- =============================================================================
