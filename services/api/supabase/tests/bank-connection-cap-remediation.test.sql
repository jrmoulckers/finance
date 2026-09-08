-- SPDX-License-Identifier: BUSL-1.1

\set ON_ERROR_STOP on

-- Stage 6 remediation regression suite (Refs #4404).
-- Run only against local Supabase:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/bank-connection-cap-remediation.test.sql
--
-- Complements supabase/tests/bank-connection-cap.test.sql, which proves the
-- original Stage 6 behaviour. This file proves the three database-visible
-- defects found in post-merge review are fixed, and nails down the boundary
-- cases the first suite left open:
--
--   1. A LAPSED entitlement projection resolves to 0 everywhere — the cap, the
--      capacity snapshot, the reserve/finalize RPCs, and the direct-writer
--      trigger — so a household whose allowance expired cannot create, keep
--      reserving, or reconnect its way into another billable Item.
--   2. Finalization is IDEMPOTENT on a caller-generated connection id, and
--      `bank_connection_finalization_state` answers "did it commit?"
--      definitively, so a caller whose response was lost never revokes an Item
--      that is already backing a live row.
--   3. The orphan handoff has a bounded, terminal credential lifecycle: the
--      credential exists only while the row is open, disposition destroys it in
--      the same statement, retention is capped, and account deletion can claim
--      the rows to propagate erasure to the processor.
--
-- Tier/add-on/non-stacking projection MATH lives in
-- billing-entitlements-integration.test.sql (which proves, among others, that a
-- Family 4 and two sponsors' add-ons resolve to a single maximum and never a
-- sum). Here the cap is proven to track whatever that single projected
-- allowance is, and never to compute one of its own.

BEGIN;

CREATE FUNCTION pg_temp.assert_true(p_condition BOOLEAN, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT COALESCE(p_condition, false) THEN
        RAISE EXCEPTION 'assertion failed: %', p_message;
    END IF;
END;
$$;

CREATE FUNCTION pg_temp.expect_error(p_sql TEXT, p_sqlstate TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE = p_sqlstate THEN
                RETURN;
            END IF;
            RAISE EXCEPTION 'assertion failed: % (expected SQLSTATE %, got %: %)',
                p_message, p_sqlstate, SQLSTATE, SQLERRM;
    END;
    RAISE EXCEPTION 'assertion failed: % (statement unexpectedly succeeded)', p_message;
END;
$$;

CREATE FUNCTION pg_temp.set_allowance(p_household UUID, p_allowance BIGINT, p_tier TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
    UPDATE current_household_entitlements
    SET bank_connection_allowance = p_allowance,
        display_tier = p_tier,
        is_premium_sponsored = (p_tier = 'premium')
    WHERE household_id = p_household;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege surface for every remediation RPC
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    NOT has_function_privilege(
        'authenticated', 'bank_connection_finalization_state(uuid,uuid)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon', 'bank_connection_finalization_state(uuid,uuid)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated', 'complete_orphaned_bank_item(uuid,text,text)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated', 'record_orphaned_bank_item_attempt(uuid,text)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated', 'claim_orphaned_bank_items_for_erasure(uuid,uuid[])', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated', 'purge_expired_orphaned_bank_items(interval)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'finalize_bank_connection_reservation(uuid,uuid,uuid,text,text,text,text,jsonb,uuid)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'record_orphaned_bank_item(uuid,uuid,text,text,text,text,uuid)',
        'EXECUTE'
    ),
    'no remediation RPC may be reachable by anon or authenticated'
);

SELECT pg_temp.assert_true(
    has_function_privilege(
        'service_role', 'bank_connection_finalization_state(uuid,uuid)', 'EXECUTE'
    )
    AND has_function_privilege(
        'service_role', 'complete_orphaned_bank_item(uuid,text,text)', 'EXECUTE'
    )
    AND has_function_privilege(
        'service_role', 'record_orphaned_bank_item_attempt(uuid,text)', 'EXECUTE'
    )
    AND has_function_privilege(
        'service_role', 'claim_orphaned_bank_items_for_erasure(uuid,uuid[])', 'EXECUTE'
    )
    AND has_function_privilege(
        'service_role', 'purge_expired_orphaned_bank_items(interval)', 'EXECUTE'
    )
    AND has_function_privilege(
        'service_role',
        'finalize_bank_connection_reservation(uuid,uuid,uuid,text,text,text,text,jsonb,uuid)',
        'EXECUTE'
    ),
    'every remediation RPC must be executable by service_role'
);

SELECT pg_temp.assert_true(
    (
        SELECT bool_and(p.proconfig @> ARRAY['search_path=public'])
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'bank_connection_finalization_state',
              'complete_orphaned_bank_item',
              'record_orphaned_bank_item_attempt',
              'claim_orphaned_bank_items_for_erasure',
              'purge_expired_orphaned_bank_items',
              'record_orphaned_bank_item',
              'finalize_bank_connection_reservation',
              'bank_connection_cap_for_household'
          )
    ),
    'all remediation RPCs must pin search_path=public'
);

-- The pre-remediation 8-argument finalize must be gone, so no caller can reach
-- a non-idempotent finalization by omitting the connection id.
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'finalize_bank_connection_reservation'
    ),
    'exactly one finalize_bank_connection_reservation overload must exist'
);

-- No function reachable by a client may read the credential-bearing table.
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosrc LIKE '%bank_connection_orphaned_items%'
          AND (
              has_function_privilege('authenticated', p.oid, 'EXECUTE')
              OR has_function_privilege('anon', p.oid, 'EXECUTE')
          )
    ),
    'no client-executable function may touch the orphan handoff table'
);

-- ---------------------------------------------------------------------------
-- Tenant fixtures and a real Premium-sponsored projection row
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
    '44041000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'bankcap-remediation-4404@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO users (id, email, display_name) VALUES
    ('44041000-0000-4000-8000-000000000001', 'bankcap-r1@example.invalid', 'Remediation Owner');

INSERT INTO households (id, name, created_by) VALUES
    (
        '44041000-0000-4000-9000-000000000001',
        'Remediation Premium Household',
        '44041000-0000-4000-8000-000000000001'
    );

INSERT INTO household_members (id, household_id, user_id, role) VALUES
    (
        '44041000-0000-4000-a000-000000000001',
        '44041000-0000-4000-9000-000000000001',
        '44041000-0000-4000-8000-000000000001',
        'owner'
    );

INSERT INTO billing_accounts (id, owner_id) VALUES
    ('44041000-0000-4000-b000-000000000001', '44041000-0000-4000-8000-000000000001');

INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
)
VALUES (
    '44041000-0000-4000-c000-000000000001',
    '44041000-0000-4000-b000-000000000001',
    'stripe', 'sandbox', 'cus_4404_remediation', true
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(public.record_billing_provider_event(
        '44041000-0000-4000-b000-000000000001',
        '44041000-0000-4000-c000-000000000001',
        'stripe', 'sandbox',
        'evt_4404_rem_premium', 'sub_4404_rem_premium', NULL,
        now(), now() - interval '2 days', 10,
        'activated', 'active', 'base_plan', 'premium', 1,
        now() + interval '30 days',
        NULL, NULL, NULL
    )),
    'owner Premium base-plan event must apply'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub', '44041000-0000-4000-8000-000000000001', true
);
SELECT public.set_my_premium_household_sponsorship(
    '44041000-0000-4000-9000-000000000001'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44041000-0000-4000-9000-000000000001') = 2,
    'a live Premium-sponsored projection resolves to the projected allowance of 2'
);

-- Non-stacking is a property of the projection, which holds exactly one row per
-- household; the cap reads that one value and never sums across sources.
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM current_household_entitlements
        WHERE household_id = '44041000-0000-4000-9000-000000000001'
    )
    AND (
        SELECT bank_connection_cap_for_household(household_id) = bank_connection_allowance
        FROM current_household_entitlements
        WHERE household_id = '44041000-0000-4000-9000-000000000001'
    ),
    'the cap is exactly the single projected allowance, never a sum across sources'
);

-- ---------------------------------------------------------------------------
-- FINDING 1 — a LAPSED projection resolves to zero on every path
-- ---------------------------------------------------------------------------
-- The projection is refreshed by billing and membership events, not by a clock,
-- so a positive row survives its own expiry until something else refreshes it.
-- Nothing may reserve, finalize, insert, or reconnect through that window.

UPDATE current_household_entitlements
SET expires_at = now() - interval '1 second'
WHERE household_id = '44041000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT bank_connection_allowance = 2
        FROM current_household_entitlements
        WHERE household_id = '44041000-0000-4000-9000-000000000001'
    ),
    'the stale projection row still carries a positive allowance (the defect precondition)'
);

SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44041000-0000-4000-9000-000000000001') = 0,
    'an expired projection resolves the cap to 0, not to its stale allowance'
);

SELECT pg_temp.assert_true(
    (
        SELECT cap = 0 AND used = 0
        FROM bank_connection_capacity('44041000-0000-4000-9000-000000000001')
    ),
    'the capacity snapshot also resolves 0 for an expired projection'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'premium_required'
        FROM reserve_bank_connection_slot(
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid'
        )
    ),
    'reserve on an expired projection must return premium_required'
);

-- A direct writer cannot bypass the expired entitlement either: the trigger
-- shares the one rule.
SELECT pg_temp.expect_error(
    $sql$
        INSERT INTO bank_connections (
            household_id, owner_id, provider, institution_id, institution_name,
            encrypted_access_token, status
        )
        VALUES (
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'ins_expired', 'Expired Institution', 'enc_expired', 'active'
        )
    $sql$,
    '23514',
    'a direct insert under an expired projection must be blocked by the cap trigger'
);

-- A reservation taken while the entitlement was live must not be finalizable
-- after it lapses — the billable Item is rejected and the caller revokes it.
INSERT INTO bank_connection_reservations (id, household_id, owner_id, provider, expires_at)
VALUES (
    '44041000-0000-4000-d000-000000000001',
    '44041000-0000-4000-9000-000000000001',
    '44041000-0000-4000-8000-000000000001',
    'plaid',
    now() + interval '15 minutes'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'premium_required'
        FROM finalize_bank_connection_reservation(
            '44041000-0000-4000-d000-000000000001',
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'ins_lapsed', 'Lapsed Institution', 'enc_lapsed', '{}'::jsonb,
            '44041000-0000-4000-e000-000000000001'
        )
    ),
    'finalize under an expired projection must reject rather than persist a billable row'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1 FROM bank_connections
        WHERE id = '44041000-0000-4000-e000-000000000001'
    ),
    'the rejected finalization must leave no connection row behind'
);

-- Restore the entitlement and confirm the cap recovers without any other action.
UPDATE current_household_entitlements
SET expires_at = now() + interval '30 days'
WHERE household_id = '44041000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44041000-0000-4000-9000-000000000001') = 2,
    'restoring the projection window restores the projected allowance'
);

-- ---------------------------------------------------------------------------
-- The cap tracks whatever the projection resolves: Family 4 and Premium+add-on
-- ---------------------------------------------------------------------------

SELECT pg_temp.set_allowance('44041000-0000-4000-9000-000000000001', 4, 'family');
SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44041000-0000-4000-9000-000000000001') = 4,
    'a Family projection resolves the bound household to an allowance of 4'
);

SELECT pg_temp.set_allowance('44041000-0000-4000-9000-000000000001', 3, 'premium');
SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44041000-0000-4000-9000-000000000001') = 3,
    'Premium plus one verified add-on resolves to 3 — the projected value, not a recomputed one'
);

-- An expired Family projection is no more privileged than an expired Premium
-- one: expiry is evaluated before the allowance is read at all.
SELECT pg_temp.set_allowance('44041000-0000-4000-9000-000000000001', 4, 'family');
UPDATE current_household_entitlements
SET expires_at = now() - interval '1 day'
WHERE household_id = '44041000-0000-4000-9000-000000000001';
SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44041000-0000-4000-9000-000000000001') = 0,
    'an expired Family projection also resolves to 0'
);

UPDATE current_household_entitlements
SET expires_at = now() + interval '30 days'
WHERE household_id = '44041000-0000-4000-9000-000000000001';
SELECT pg_temp.set_allowance('44041000-0000-4000-9000-000000000001', 2, 'premium');

-- ---------------------------------------------------------------------------
-- FINDING 2 — idempotent finalization on a caller-generated connection id
-- ---------------------------------------------------------------------------

INSERT INTO bank_connection_reservations (id, household_id, owner_id, provider, expires_at)
VALUES (
    '44041000-0000-4000-d000-000000000002',
    '44041000-0000-4000-9000-000000000001',
    '44041000-0000-4000-8000-000000000001',
    'plaid',
    now() + interval '15 minutes'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'finalized'
           AND connection_id = '44041000-0000-4000-e000-000000000002'
        FROM finalize_bank_connection_reservation(
            '44041000-0000-4000-d000-000000000002',
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'ins_idem', 'Idempotent Institution', 'enc_idem', '{}'::jsonb,
            '44041000-0000-4000-e000-000000000002'
        )
    ),
    'finalize persists the row under the caller-generated connection id'
);

-- The replay a caller performs after losing the first response. The reservation
-- is already consumed, so a non-idempotent finalize would answer
-- reservation_not_found and the caller would revoke a LIVE Item.
SELECT pg_temp.assert_true(
    (
        SELECT status = 'finalized'
           AND connection_id = '44041000-0000-4000-e000-000000000002'
        FROM finalize_bank_connection_reservation(
            '44041000-0000-4000-d000-000000000002',
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'ins_idem', 'Idempotent Institution', 'enc_idem', '{}'::jsonb,
            '44041000-0000-4000-e000-000000000002'
        )
    ),
    'replaying the same connection id reports the committed row, not a rejection'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM bank_connections
        WHERE household_id = '44041000-0000-4000-9000-000000000001'
          AND deleted_at IS NULL
    ),
    'the replay must not create a second billable connection'
);

SELECT pg_temp.assert_true(
    (
        SELECT state = 'finalized' AND created_at IS NOT NULL
        FROM bank_connection_finalization_state(
            '44041000-0000-4000-e000-000000000002',
            '44041000-0000-4000-9000-000000000001'
        )
    ),
    'the confirming read reports a committed connection as finalized'
);

SELECT pg_temp.assert_true(
    (
        SELECT state = 'absent'
        FROM bank_connection_finalization_state(
            '44041000-0000-4000-e000-0000000000ff',
            '44041000-0000-4000-9000-000000000001'
        )
    ),
    'the confirming read reports an uncommitted connection id as absent'
);

-- Cross-household confirmation must not leak another household's row.
SELECT pg_temp.assert_true(
    (
        SELECT state = 'absent'
        FROM bank_connection_finalization_state(
            '44041000-0000-4000-e000-000000000002',
            '44041000-0000-4000-9000-0000000000ff'
        )
    ),
    'the confirming read is scoped to the household that owns the connection'
);

-- ---------------------------------------------------------------------------
-- Soft-delete, reconnect/undelete, and the direct-writer boundary
-- ---------------------------------------------------------------------------

-- Represent a completed disconnect: the durable outbox has already confirmed
-- provider revocation and purged the connection-row credential.
UPDATE bank_connections
SET deleted_at = now(),
    status = 'disconnected',
    sync_enabled = false,
    sync_disabled_at = now(),
    encrypted_access_token = NULL
WHERE id = '44041000-0000-4000-e000-000000000002';

SELECT pg_temp.assert_true(
    (SELECT used = 0 FROM bank_connection_capacity('44041000-0000-4000-9000-000000000001')),
    'a soft-deleted connection stops consuming allowance'
);

-- A disconnected row is a definite, non-finalized outcome for a replay: the
-- caller must be told, not handed a live-looking success.
SELECT pg_temp.assert_true(
    (
        SELECT status = 'already_disconnected'
        FROM finalize_bank_connection_reservation(
            '44041000-0000-4000-d000-000000000002',
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'ins_idem', 'Idempotent Institution', 'enc_idem', '{}'::jsonb,
            '44041000-0000-4000-e000-000000000002'
        )
    ),
    'replaying a connection id that was created and then disconnected is a definite rejection'
);

SELECT pg_temp.assert_true(
    (
        SELECT state = 'disconnected'
        FROM bank_connection_finalization_state(
            '44041000-0000-4000-e000-000000000002',
            '44041000-0000-4000-9000-000000000001'
        )
    ),
    'the confirming read distinguishes disconnected from absent'
);

-- Reconnect (undelete) is a NEW live row for allowance purposes and is checked
-- against the same one rule.
UPDATE bank_connections
SET deleted_at = NULL,
    status = 'active',
    sync_enabled = true,
    sync_disabled_at = NULL,
    encrypted_access_token = 'enc_idem'
WHERE id = '44041000-0000-4000-e000-000000000002';

SELECT pg_temp.assert_true(
    (SELECT used = 1 FROM bank_connection_capacity('44041000-0000-4000-9000-000000000001')),
    'reconnecting an undeleted connection consumes allowance again'
);

-- Fill the cap, then prove an undelete cannot exceed it.
INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status
)
VALUES (
    '44041000-0000-4000-e000-000000000003',
    '44041000-0000-4000-9000-000000000001',
    '44041000-0000-4000-8000-000000000001',
    'plaid', 'ins_second', 'Second Institution', 'enc_second', 'active'
);

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, sync_enabled, sync_disabled_at, deleted_at
)
VALUES (
    '44041000-0000-4000-e000-000000000004',
    '44041000-0000-4000-9000-000000000001',
    '44041000-0000-4000-8000-000000000001',
    'plaid', 'ins_third', 'Third Institution', NULL, 'disconnected', false, now(), now()
);

SELECT pg_temp.expect_error(
    $sql$
        UPDATE bank_connections
        SET deleted_at = NULL,
            status = 'active',
            sync_enabled = true,
            sync_disabled_at = NULL,
            encrypted_access_token = 'enc_third'
        WHERE id = '44041000-0000-4000-e000-000000000004'
    $sql$,
    '23514',
    'reconnecting a third connection at a cap of 2 must be blocked by the trigger'
);

-- ---------------------------------------------------------------------------
-- Final-slot boundary: a reservation owns the last slot exclusively
-- ---------------------------------------------------------------------------
-- True cross-session concurrency is proven in
-- bank-connection-cap-concurrency.test.ps1; this pins the invariant the lock
-- protects — a held reservation is consumed capacity for EVERY other writer.

UPDATE bank_connections
SET deleted_at = now(),
    status = 'disconnected',
    sync_enabled = false,
    sync_disabled_at = now(),
    encrypted_access_token = NULL
WHERE id = '44041000-0000-4000-e000-000000000003';

INSERT INTO bank_connection_reservations (id, household_id, owner_id, provider, expires_at)
VALUES (
    '44041000-0000-4000-d000-000000000003',
    '44041000-0000-4000-9000-000000000001',
    '44041000-0000-4000-8000-000000000001',
    'mx',
    now() + interval '15 minutes'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'at_cap' AND used = 2
        FROM reserve_bank_connection_slot(
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid'
        )
    ),
    'the final slot held by a reservation is not re-reservable'
);

SELECT pg_temp.expect_error(
    $sql$
        INSERT INTO bank_connections (
            household_id, owner_id, provider, institution_id, institution_name,
            encrypted_access_token, status
        )
        VALUES (
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'mx', 'ins_steal', 'Stealing Institution', 'enc_steal', 'active'
        )
    $sql$,
    '23514',
    'a direct writer cannot steal the final slot held by a reservation'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'finalized'
        FROM finalize_bank_connection_reservation(
            '44041000-0000-4000-d000-000000000003',
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'mx', 'ins_final', 'Final Institution', 'enc_final', '{}'::jsonb,
            '44041000-0000-4000-e000-000000000005'
        )
    ),
    'the reservation holder consumes exactly the final slot it reserved'
);

-- An expired reservation holds nothing, and a finalize that arrives after both
-- expiry and refill is rejected rather than exceeding the cap.
INSERT INTO bank_connection_reservations (id, household_id, owner_id, provider, created_at, expires_at)
VALUES (
    '44041000-0000-4000-d000-000000000004',
    '44041000-0000-4000-9000-000000000001',
    '44041000-0000-4000-8000-000000000001',
    'plaid',
    now() - interval '1 hour',
    now() - interval '30 minutes'
);

SELECT pg_temp.assert_true(
    (SELECT used = 2 FROM bank_connection_capacity('44041000-0000-4000-9000-000000000001')),
    'an expired reservation does not consume allowance'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'at_cap'
        FROM finalize_bank_connection_reservation(
            '44041000-0000-4000-d000-000000000004',
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'ins_late', 'Late Institution', 'enc_late', '{}'::jsonb,
            '44041000-0000-4000-e000-000000000006'
        )
    ),
    'finalizing an expired reservation whose slot was refilled is rejected as at_cap'
);

-- ---------------------------------------------------------------------------
-- FINDING 3 — bounded, terminal orphan credential lifecycle
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT record_orphaned_bank_item IS NOT NULL
        FROM record_orphaned_bank_item(
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'enc_orphan_revoke', 'ITEM_LOCKED'
        )
    ),
    'a definitely-absent finalization records a pending_revocation handoff'
);

SELECT pg_temp.assert_true(
    (
        SELECT record_orphaned_bank_item IS NOT NULL
        FROM record_orphaned_bank_item(
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'enc_orphan_reconcile', 'FINALIZE_OUTCOME_UNKNOWN',
            'pending_reconciliation',
            '44041000-0000-4000-e000-000000000007'
        )
    ),
    'an unknown finalization records a pending_reconciliation handoff carrying the connection id'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'pending_reconciliation'
           AND connection_id = '44041000-0000-4000-e000-000000000007'
           AND encrypted_access_token = 'enc_orphan_reconcile'
           AND revoked_at IS NULL
           AND retain_until > now()
           AND retain_until <= now() + interval '30 days'
        FROM bank_connection_orphaned_items
        WHERE encrypted_access_token = 'enc_orphan_reconcile'
    ),
    'a reconciliation handoff keeps its credential and carries a bounded retention window'
);

-- A handoff may never be created already terminal: that would mean recording a
-- row with no credential and nothing left to revoke.
SELECT pg_temp.expect_error(
    $sql$
        SELECT record_orphaned_bank_item(
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', 'enc_bad', NULL, 'revoked', NULL
        )
    $sql$,
    '23514',
    'a handoff cannot be recorded in a terminal status'
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT record_orphaned_bank_item(
            '44041000-0000-4000-9000-000000000001',
            '44041000-0000-4000-8000-000000000001',
            'plaid', '   ', 'EMPTY'
        )
    $sql$,
    '23502',
    'recording a handoff without a credential is rejected so revocation is never lost'
);

-- A failed attempt must NOT discard the credential — it is the only way to
-- revoke — but it must be recorded.
SELECT pg_temp.assert_true(
    record_orphaned_bank_item_attempt(
        (
            SELECT id FROM bank_connection_orphaned_items
            WHERE encrypted_access_token = 'enc_orphan_revoke'
        ),
        'PROVIDER_DOWN'
    ),
    'a failed revocation attempt is recorded against the open handoff'
);

SELECT pg_temp.assert_true(
    (
        SELECT attempts = 2 AND last_error_code = 'PROVIDER_DOWN'
           AND encrypted_access_token = 'enc_orphan_revoke'
           AND status = 'pending_revocation'
        FROM bank_connection_orphaned_items
        WHERE encrypted_access_token = 'enc_orphan_revoke'
    ),
    'a failed attempt keeps the credential and the open status'
);

-- Terminal disposition destroys the credential in the same statement.
SELECT pg_temp.assert_true(
    complete_orphaned_bank_item(
        (
            SELECT id FROM bank_connection_orphaned_items
            WHERE encrypted_access_token = 'enc_orphan_revoke'
        ),
        'revoked'
    ),
    'an open handoff can be moved to a terminal revoked state'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1 FROM bank_connection_orphaned_items
        WHERE status IN ('revoked', 'abandoned')
          AND encrypted_access_token IS NOT NULL
    ),
    'no terminal handoff may still hold a credential'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'revoked' AND revoked_at IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE last_error_code = 'PROVIDER_DOWN'
    ),
    'terminal disposition records when it happened'
);

-- Terminal disposition is idempotent: a second call changes nothing.
SELECT pg_temp.assert_true(
    NOT complete_orphaned_bank_item(
        (
            SELECT id FROM bank_connection_orphaned_items
            WHERE last_error_code = 'PROVIDER_DOWN'
        ),
        'revoked'
    ),
    'completing an already-terminal handoff is a no-op'
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT complete_orphaned_bank_item(gen_random_uuid(), 'pending_revocation')
    $sql$,
    '23514',
    'complete_orphaned_bank_item only accepts a terminal status'
);

-- The constraint, not just the RPC, forbids an open row without a credential.
SELECT pg_temp.expect_error(
    $sql$
        UPDATE bank_connection_orphaned_items
        SET encrypted_access_token = NULL
        WHERE status = 'pending_reconciliation'
    $sql$,
    '23514',
    'an open handoff cannot be stripped of its credential while it stays open'
);

-- ---------------------------------------------------------------------------
-- Account-deletion erasure claim
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM claim_orphaned_bank_items_for_erasure(
            '44041000-0000-4000-8000-000000000001',
            ARRAY['44041000-0000-4000-9000-000000000001']::UUID[]
        )
    ),
    'account deletion claims the account''s open handoffs and returns them for revocation'
);

SELECT pg_temp.assert_true(
    (
        SELECT erasure_requested_at IS NOT NULL
           AND retain_until <= now() + interval '7 days'
           AND encrypted_access_token = 'enc_orphan_reconcile'
        FROM bank_connection_orphaned_items
        WHERE encrypted_access_token = 'enc_orphan_reconcile'
    ),
    'the erasure claim shortens retention without discarding the retry credential'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 0
        FROM claim_orphaned_bank_items_for_erasure(
            '44041000-0000-4000-8000-0000000000ff',
            ARRAY['44041000-0000-4000-9000-0000000000ff']::UUID[]
        )
    ),
    'the erasure claim is scoped to the deleting account'
);

-- Erasure must survive the account rows it points at: the FKs are
-- ON DELETE SET NULL, so the handoff (and its bounded retention) outlives them.
UPDATE bank_connection_orphaned_items
SET household_id = NULL, owner_id = NULL
WHERE encrypted_access_token = 'enc_orphan_reconcile';

SELECT pg_temp.assert_true(
    (
        SELECT retain_until IS NOT NULL AND status = 'pending_reconciliation'
        FROM bank_connection_orphaned_items
        WHERE encrypted_access_token = 'enc_orphan_reconcile'
    ),
    'a detached handoff keeps a bounded retention window'
);

-- ---------------------------------------------------------------------------
-- Bounded retention backstop
-- ---------------------------------------------------------------------------

UPDATE bank_connection_orphaned_items
SET retain_until = now() - interval '1 minute'
WHERE encrypted_access_token = 'enc_orphan_reconcile';

UPDATE bank_connection_orphaned_items
SET revoked_at = now() - interval '200 days'
WHERE status = 'revoked';

SELECT pg_temp.assert_true(
    (
        SELECT abandoned = 1 AND deleted = 1
        FROM purge_expired_orphaned_bank_items()
    ),
    'the retention backstop abandons expired open rows and deletes aged terminal rows'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1 FROM bank_connection_orphaned_items
        WHERE encrypted_access_token IS NOT NULL
    ),
    'no credential survives past its retention window'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'abandoned' AND revoked_at IS NOT NULL
           AND last_error_code = 'FINALIZE_OUTCOME_UNKNOWN'
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44041000-0000-4000-e000-000000000007'
    ),
    'a force-abandoned row is dispositioned and keeps its non-sensitive error detail'
);

-- ---------------------------------------------------------------------------
-- The ceiling has a caller: retention is actually enforced on a schedule
--
-- `retain_until` bounds nothing if no process ever evaluates it. These
-- assertions pin the two independent callers wired up by the migration.
-- ---------------------------------------------------------------------------

-- 1. The shared orchestrator that the existing daily `daily-maintenance` cron
--    job runs. This is the load-bearing path — it works even on deployments
--    without pg_cron, where maintenance is driven externally.
SELECT pg_temp.assert_true(
    (
        SELECT prosrc LIKE '%purge_expired_orphaned_bank_items%'
        FROM pg_proc
        WHERE proname = 'run_all_maintenance'
          AND pronamespace = 'public'::regnamespace
    ),
    'run_all_maintenance() must call the orphan retention purge'
);

-- 2. The dedicated job, which keeps enforcing expiry if the shared orchestrator
--    is later trimmed or fails partway through an earlier step. pg_cron is not
--    installed on local dev or free tier, so the check is conditional and
--    dynamic (the `cron` schema does not exist to be parsed against) — but
--    where the extension IS present, the job must exist.
DO $cron$
DECLARE
    v_scheduled BOOLEAN;
BEGIN
    IF to_regclass('cron.job') IS NULL THEN
        RAISE NOTICE 'pg_cron not installed - dedicated retention job assertion skipped';
        RETURN;
    END IF;

    EXECUTE $q$
        SELECT EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'purge-orphaned-bank-items'
        )
    $q$ INTO v_scheduled;

    IF NOT v_scheduled THEN
        RAISE EXCEPTION 'ASSERTION FAILED: the dedicated orphan retention job must be scheduled';
    END IF;
END $cron$;

-- 3. The contract that matters: driving the ORCHESTRATOR (not the purge
--    directly) destroys a credential whose ceiling has passed. The probe row is
--    tracked by its non-sensitive error code, because the credential column it
--    was inserted with is exactly what the purge must destroy.
--
--    Calling the orchestrator rather than the purge is deliberate and has
--    already earned its keep: it is what caught `run_all_maintenance()` aborting
--    on an ambiguous `cleanup_old_audit_logs()` overload before it ever reached
--    the purge. A ceiling behind a function that raises on step five is not a
--    ceiling, so this assertion has to exercise the whole path.
SELECT record_orphaned_bank_item(
    '44041000-0000-4000-9000-000000000001',
    '44041000-0000-4000-8000-000000000001',
    'plaid', 'enc_orphan_retention', 'RETENTION_PROBE'
);

UPDATE bank_connection_orphaned_items
SET retain_until = now() - interval '1 second'
WHERE last_error_code = 'RETENTION_PROBE';

SELECT pg_temp.assert_true(
    (SELECT (run_all_maintenance() ->> 'bank_orphans_abandoned')::BIGINT >= 1),
    'the scheduled maintenance run reports the orphan rows it force-abandoned'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'abandoned'
           AND encrypted_access_token IS NULL
           AND revoked_at IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE last_error_code = 'RETENTION_PROBE'
    ),
    'maintenance destroys a credential whose retention ceiling has passed'
);

ROLLBACK;

\echo 'bank-connection-cap-remediation.test.sql: all assertions passed'
