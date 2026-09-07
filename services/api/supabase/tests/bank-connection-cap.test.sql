-- SPDX-License-Identifier: BUSL-1.1

\set ON_ERROR_STOP on

-- Stage 6 tier-aware bank connection cap integration test (#4404).
-- Run only against local Supabase:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/bank-connection-cap.test.sql
--
-- Covers the one documented rule (bank_connection_cap_for_household), the
-- server-only reservation/orphan surface, the atomic reserve -> finalize flow,
-- the direct-writer trigger that shares that one rule, reservation counting and
-- expiry, and the provider-success/database-failure (finalize at_cap) path.
-- Tier/add-on/non-stacking projection MATH is proven in
-- billing-entitlements-integration.test.sql; here the cap is exercised against
-- the real projection row and then re-pointed to prove the subsystem honours
-- whatever the projection resolves, never a client value.

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

-- Seeds one live bank connection directly through the finalize RPC's target
-- table using a fresh reservation, mirroring what production persists.
CREATE FUNCTION pg_temp.seed_live_connection(
    p_household UUID,
    p_owner UUID,
    p_suffix TEXT
)
RETURNS UUID
LANGUAGE sql
AS $$
    INSERT INTO bank_connections (
        household_id, owner_id, provider, institution_id, institution_name,
        encrypted_access_token, status
    )
    VALUES (
        p_household, p_owner, 'plaid', 'ins_' || p_suffix,
        'Institution ' || p_suffix, 'enc_' || p_suffix, 'active'
    )
    RETURNING id;
$$;

-- ---------------------------------------------------------------------------
-- Schema, RLS, and least-privilege surface
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
              'bank_connection_reservations',
              'bank_connection_orphaned_items'
          )
          AND c.relrowsecurity
    ),
    'RLS must be enabled on both server-only cap tables'
);

SELECT pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'bank_connection_reservations', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'bank_connection_reservations', 'INSERT')
    AND NOT has_table_privilege('anon', 'bank_connection_reservations', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'bank_connection_orphaned_items', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'bank_connection_orphaned_items', 'INSERT')
    AND NOT has_table_privilege('anon', 'bank_connection_orphaned_items', 'SELECT')
    AND has_table_privilege('service_role', 'bank_connection_reservations', 'INSERT')
    AND has_table_privilege('service_role', 'bank_connection_orphaned_items', 'INSERT'),
    'cap tables must be server-only: no authenticated/anon access, service_role only'
);

SELECT pg_temp.assert_true(
    NOT has_function_privilege(
        'authenticated', 'bank_connection_cap_for_household(uuid)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated', 'bank_connection_capacity(uuid)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'reserve_bank_connection_slot(uuid,uuid,text,integer)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'finalize_bank_connection_reservation(uuid,uuid,uuid,text,text,text,text,jsonb)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'record_orphaned_bank_item(uuid,uuid,text,text,text)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'service_role',
        'reserve_bank_connection_slot(uuid,uuid,text,integer)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'service_role',
        'finalize_bank_connection_reservation(uuid,uuid,uuid,text,text,text,text,jsonb)',
        'EXECUTE'
    ),
    'reservation RPCs must be server-only (service_role), never authenticated'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname IN (
            'bank_connection_cap_for_household',
            'bank_connection_capacity',
            'bank_connection_reservation_lock_key',
            'reserve_bank_connection_slot',
            'finalize_bank_connection_reservation',
            'release_bank_connection_reservation',
            'record_orphaned_bank_item',
            'enforce_bank_connection_cap'
        )
          AND NOT (proconfig @> ARRAY['search_path=public'])
    ),
    'all cap RPCs and the trigger function must pin search_path=public'
);

-- The lock class must be disjoint from the billing ledger lock class so the
-- read-only cap subsystem cannot invert lock order with the entitlement ledger.
SELECT pg_temp.assert_true(
    bank_connection_reservation_lock_key('00000000-0000-4000-8000-000000000001')
        = bank_connection_reservation_lock_key('00000000-0000-4000-8000-000000000001')
    AND bank_connection_reservation_lock_key('00000000-0000-4000-8000-000000000001')
        <> bank_connection_reservation_lock_key('00000000-0000-4000-8000-000000000002'),
    'the reservation advisory-lock key must be stable per household and distinct across households'
);

-- ---------------------------------------------------------------------------
-- Tenant fixtures and a real Premium-sponsored projection row
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
    '44040000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'bankcap-owner-4404@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO users (id, email, display_name) VALUES
    ('44040000-0000-4000-8000-000000000001', 'bankcap-u1@example.invalid', 'Bank Cap Owner'),
    ('44040000-0000-4000-8000-000000000002', 'bankcap-u2@example.invalid', 'Bank Cap Outsider');

INSERT INTO households (id, name, created_by) VALUES
    (
        '44040000-0000-4000-9000-000000000001',
        'Bank Cap Premium Household',
        '44040000-0000-4000-8000-000000000001'
    ),
    (
        '44040000-0000-4000-9000-000000000002',
        'Bank Cap Free Household',
        '44040000-0000-4000-8000-000000000001'
    );

INSERT INTO household_members (id, household_id, user_id, role) VALUES
    (
        '44040000-0000-4000-a000-000000000001',
        '44040000-0000-4000-9000-000000000001',
        '44040000-0000-4000-8000-000000000001',
        'owner'
    ),
    (
        '44040000-0000-4000-a000-000000000002',
        '44040000-0000-4000-9000-000000000002',
        '44040000-0000-4000-8000-000000000001',
        'owner'
    );

INSERT INTO billing_accounts (id, owner_id) VALUES
    ('44040000-0000-4000-b000-000000000001', '44040000-0000-4000-8000-000000000001');

INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
)
VALUES (
    '44040000-0000-4000-c000-000000000001',
    '44040000-0000-4000-b000-000000000001',
    'stripe', 'sandbox', 'cus_4404_primary', true
);

-- Personal Premium for the owner, then sponsor the Premium household so the
-- projection resolves to Premium (allowance 2) through the real Stage 5 path.
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(public.record_billing_provider_event(
        '44040000-0000-4000-b000-000000000001',
        '44040000-0000-4000-c000-000000000001',
        'stripe', 'sandbox',
        'evt_4404_premium', 'sub_4404_premium', NULL,
        now(), now() - interval '2 days', 10,
        'activated', 'active', 'base_plan', 'premium', 1,
        now() + interval '30 days',
        NULL, NULL, NULL
    )),
    'owner Premium base-plan event must apply'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub', '44040000-0000-4000-8000-000000000001', true
);
SELECT public.set_my_premium_household_sponsorship(
    '44040000-0000-4000-9000-000000000001'
);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The one rule: the cap is exactly the projection allowance, 0 when absent
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44040000-0000-4000-9000-000000000001') = 2,
    'Premium-sponsored household resolves to the projected allowance of 2'
);

SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44040000-0000-4000-9000-000000000002') = 0,
    'a household with no projection row (Free/Plus) resolves to 0'
);

-- ---------------------------------------------------------------------------
-- Free/Plus (allowance 0): reserve is refused with premium_required, and a
-- direct writer cannot bypass the trigger to create the first connection.
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT status = 'premium_required'
        FROM reserve_bank_connection_slot(
            '44040000-0000-4000-9000-000000000002',
            '44040000-0000-4000-8000-000000000001',
            'plaid'
        )
    ),
    'reserve on a 0-allowance household must return premium_required'
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT pg_temp.seed_live_connection(
            '44040000-0000-4000-9000-000000000002',
            '44040000-0000-4000-8000-000000000001',
            'free_bypass'
        )
    $sql$,
    '23514',
    'a direct insert on a 0-allowance household must be blocked by the cap trigger'
);

-- ---------------------------------------------------------------------------
-- Non-member is forbidden before any lock or capacity work
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT status = 'forbidden'
        FROM reserve_bank_connection_slot(
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000002',
            'plaid'
        )
    ),
    'reserve for a non-member must return forbidden'
);

-- ---------------------------------------------------------------------------
-- Premium (allowance 2): reserve up to the cap, then refuse the next
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT status = 'reserved' AND reservation_id IS NOT NULL AND cap = 2 AND used = 1
        FROM reserve_bank_connection_slot(
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'plaid'
        )
    ),
    'first reserve under a cap of 2 succeeds and reports used=1'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'reserved' AND used = 2
        FROM reserve_bank_connection_slot(
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'mx'
        )
    ),
    'second reserve fills the cap and reports used=2'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connection_reservations
        WHERE household_id = '44040000-0000-4000-9000-000000000001'
    ),
    'two live reservations now hold both slots'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'at_cap' AND cap = 2 AND used = 2
        FROM reserve_bank_connection_slot(
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'plaid'
        )
    ),
    'a third reserve is refused with at_cap because reservations are counted'
);

-- A direct writer must not be able to steal a reserved slot.
SELECT pg_temp.expect_error(
    $sql$
        SELECT pg_temp.seed_live_connection(
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'steal'
        )
    $sql$,
    '23514',
    'a direct insert must not steal a slot held by an unexpired reservation'
);

-- ---------------------------------------------------------------------------
-- Expiry: an expired reservation frees its slot for a direct writer
-- ---------------------------------------------------------------------------

UPDATE bank_connection_reservations
SET created_at = now() - interval '20 minutes',
    expires_at = now() - interval '1 second'
WHERE household_id = '44040000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT bank_connection_capacity.used = 0
        FROM bank_connection_capacity('44040000-0000-4000-9000-000000000001')
    ),
    'expired reservations do not count toward consumed capacity'
);

SELECT pg_temp.seed_live_connection(
    '44040000-0000-4000-9000-000000000001',
    '44040000-0000-4000-8000-000000000001',
    'after_expiry'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM bank_connections
        WHERE household_id = '44040000-0000-4000-9000-000000000001'
          AND deleted_at IS NULL
    ),
    'a direct insert succeeds once the reservations have expired'
);

-- Clear expired reservations so the next section starts from one live row.
DELETE FROM bank_connection_reservations
WHERE household_id = '44040000-0000-4000-9000-000000000001';

-- ---------------------------------------------------------------------------
-- finalize consumes its reservation and inserts the row atomically
-- ---------------------------------------------------------------------------

-- One live row + one fresh reservation = at cap of 2.
INSERT INTO bank_connection_reservations (
    id, household_id, owner_id, provider, expires_at
)
VALUES (
    '44040000-0000-4000-d000-000000000001',
    '44040000-0000-4000-9000-000000000001',
    '44040000-0000-4000-8000-000000000001',
    'plaid',
    now() + interval '15 minutes'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'finalized' AND connection_id IS NOT NULL
        FROM finalize_bank_connection_reservation(
            '44040000-0000-4000-d000-000000000001',
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'plaid', 'ins_final', 'Final Institution', 'enc_final'
        )
    ),
    'finalize consumes the reservation and inserts the connection under the lock'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1 FROM bank_connection_reservations
        WHERE id = '44040000-0000-4000-d000-000000000001'
    )
    AND (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE household_id = '44040000-0000-4000-9000-000000000001'
          AND deleted_at IS NULL
    ),
    'the reservation is gone and two live connections now fill the cap'
);

-- ---------------------------------------------------------------------------
-- provider success + database failure: finalize returns at_cap when the slot
-- was reclaimed, so the caller knows to revoke the now-orphaned Item.
-- ---------------------------------------------------------------------------

INSERT INTO bank_connection_reservations (
    id, household_id, owner_id, provider, expires_at
)
VALUES (
    '44040000-0000-4000-d000-000000000002',
    '44040000-0000-4000-9000-000000000001',
    '44040000-0000-4000-8000-000000000001',
    'plaid',
    now() + interval '15 minutes'
);

-- The cap was already full (2 live rows) before this reservation is consumed,
-- so re-deriving capacity without it still finds no room.
SELECT pg_temp.assert_true(
    (
        SELECT status = 'at_cap' AND connection_id IS NULL
        FROM finalize_bank_connection_reservation(
            '44040000-0000-4000-d000-000000000002',
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'plaid', 'ins_lost', 'Lost Institution', 'enc_lost'
        )
    ),
    'finalize returns at_cap when the slot was reclaimed during the provider exchange'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'reservation_not_found'
        FROM finalize_bank_connection_reservation(
            '44040000-0000-4000-d000-00000000dead',
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'plaid', 'ins_x', 'X', 'enc_x'
        )
    ),
    'finalize of an unknown reservation reports reservation_not_found'
);

-- ---------------------------------------------------------------------------
-- Orphan handoff durably retains the encrypted credential
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT record_orphaned_bank_item IS NOT NULL
        FROM record_orphaned_bank_item(
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'plaid', 'enc_orphan', 'ITEM_LOCKED'
        )
    ),
    'an orphaned billable Item is durably recorded for revocation retry'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'pending_revocation'
           AND attempts = 1
           AND encrypted_access_token = 'enc_orphan'
           AND last_error_code = 'ITEM_LOCKED'
           AND revoked_at IS NULL
        FROM bank_connection_orphaned_items
        WHERE household_id = '44040000-0000-4000-9000-000000000001'
          AND encrypted_access_token = 'enc_orphan'
    ),
    'the orphan row retains the encrypted credential and stays pending revocation'
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT record_orphaned_bank_item(
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'plaid', '   ', 'EMPTY'
        )
    $sql$,
    '23502',
    'recording an orphan without a credential is rejected so revocation is never lost'
);

-- ---------------------------------------------------------------------------
-- release frees a slot immediately (used by the exchange-failed path)
-- ---------------------------------------------------------------------------

-- Free one live slot first so there is room to reserve again.
UPDATE bank_connections
SET deleted_at = now()
WHERE household_id = '44040000-0000-4000-9000-000000000001'
  AND institution_id = 'ins_final';

INSERT INTO bank_connection_reservations (
    id, household_id, owner_id, provider, expires_at
)
VALUES (
    '44040000-0000-4000-d000-000000000003',
    '44040000-0000-4000-9000-000000000001',
    '44040000-0000-4000-8000-000000000001',
    'plaid',
    now() + interval '15 minutes'
);

SELECT pg_temp.assert_true(
    release_bank_connection_reservation(
        '44040000-0000-4000-d000-000000000003',
        '44040000-0000-4000-9000-000000000001'
    ),
    'release removes an unconsumed reservation and reports success'
);

SELECT pg_temp.assert_true(
    NOT release_bank_connection_reservation(
        '44040000-0000-4000-d000-000000000003',
        '44040000-0000-4000-9000-000000000001'
    ),
    'releasing an already-released reservation reports no-op'
);

-- ---------------------------------------------------------------------------
-- The subsystem honours whatever the projection resolves: re-point the cap
-- (as a Family upgrade would) and confirm more slots become available without
-- any client-supplied value. Non-stacking/tier MATH is covered upstream.
-- ---------------------------------------------------------------------------

UPDATE current_household_entitlements
SET display_tier = 'family',
    is_premium_sponsored = false,
    bank_connection_allowance = 4
WHERE household_id = '44040000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    bank_connection_cap_for_household('44040000-0000-4000-9000-000000000001') = 4,
    'the cap tracks the projection when it changes to Family (4)'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'reserved'
        FROM reserve_bank_connection_slot(
            '44040000-0000-4000-9000-000000000001',
            '44040000-0000-4000-8000-000000000001',
            'plaid'
        )
    ),
    'a slot freed by the higher Family allowance can be reserved'
);

ROLLBACK;

\echo 'bank-connection-cap.test.sql: all assertions passed'
