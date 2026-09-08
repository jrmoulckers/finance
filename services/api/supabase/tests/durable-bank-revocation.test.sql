-- SPDX-License-Identifier: BUSL-1.1

\set ON_ERROR_STOP on

-- PostgreSQL integration coverage for durable downgrade/provider revocation
-- (#4405). Run only against disposable local Supabase.

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
            RAISE EXCEPTION 'assertion failed: % (expected %, got %: %)',
                p_message, p_sqlstate, SQLSTATE, SQLERRM;
    END;
    RAISE EXCEPTION 'assertion failed: % (statement unexpectedly succeeded)', p_message;
END;
$$;

-- Server-only/RLS/search-path boundary.
SELECT pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'bank_connection_orphaned_items', 'SELECT')
    AND NOT has_table_privilege(
        'authenticated', 'bank_connection_retention_selections', 'SELECT'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'prepare_bank_connection_downgrade(uuid,uuid,text,uuid[])',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'claim_bank_connection_revocations(integer,interval)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'service_role',
        'claim_bank_connection_revocations(integer,interval)',
        'EXECUTE'
    ),
    'outbox, selection, and worker surfaces must be service-role only'
);

SELECT pg_temp.assert_true(
    (
        SELECT bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=public'])
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'enqueue_bank_connection_revocation_internal',
              'enqueue_bank_connection_revocation',
              'prepare_bank_connection_downgrade',
              'apply_bank_connection_cap_reduction_internal',
              'prepare_bank_connection_erasure',
              'claim_bank_connection_revocations',
              'complete_bank_connection_revocation',
              'fail_bank_connection_revocation',
              'bank_connection_revocation_status'
          )
    ),
    'every revocation function must be SECURITY DEFINER with a pinned search_path'
);

-- Owner and unauthorized member.
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
(
    '44050000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revocation-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
),
(
    '44050000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revocation-member@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO users (id, email, display_name) VALUES
    (
        '44050000-0000-4000-8000-000000000001',
        'revocation-owner-user@example.invalid',
        'Revocation Owner'
    ),
    (
        '44050000-0000-4000-8000-000000000002',
        'revocation-member-user@example.invalid',
        'Revocation Member'
    );

INSERT INTO households (id, name, created_by) VALUES (
    '44050000-0000-4000-9000-000000000001',
    'Durable Revocation Household',
    '44050000-0000-4000-8000-000000000001'
);
INSERT INTO household_members (id, household_id, user_id, role) VALUES
(
    '44050000-0000-4000-a000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'owner'
),
(
    '44050000-0000-4000-a000-000000000002',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000002',
    'member'
);

INSERT INTO billing_accounts (id, owner_id) VALUES (
    '44050000-0000-4000-b000-000000000001',
    '44050000-0000-4000-8000-000000000001'
);
INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
) VALUES (
    '44050000-0000-4000-c000-000000000001',
    '44050000-0000-4000-b000-000000000001',
    'stripe', 'sandbox', 'cus_4405_durable', true
);

SELECT apply_billing_provider_event(record_billing_provider_event(
    '44050000-0000-4000-b000-000000000001',
    '44050000-0000-4000-c000-000000000001',
    'stripe', 'sandbox',
    'evt_4405_premium', 'sub_4405_premium', NULL,
    now(), now() - interval '2 days', 10,
    'activated', 'active', 'base_plan', 'premium', 1,
    now() + interval '30 days', NULL, NULL, NULL
));

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44050000-0000-4000-8000-000000000001',
    true
);
SELECT set_my_premium_household_sponsorship(
    '44050000-0000-4000-9000-000000000001'
);
RESET ROLE;

-- Raise the projection to Family for four deterministic live Items.
UPDATE current_household_entitlements
SET display_tier = 'family',
    is_premium_sponsored = false,
    bank_connection_allowance = 4
WHERE household_id = '44050000-0000-4000-9000-000000000001';

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, created_at
) VALUES
(
    '44050000-0000-4000-e000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid', 'ins_1', 'Institution 1', 'enc_1', 'active', now() - interval '4 days'
),
(
    '44050000-0000-4000-e000-000000000002',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'mx', 'ins_2', 'Institution 2', 'enc_2', 'active', now() - interval '3 days'
),
(
    '44050000-0000-4000-e000-000000000003',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid', 'ins_3', 'Institution 3', 'enc_3', 'active', now() - interval '2 days'
),
(
    '44050000-0000-4000-e000-000000000004',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'mx', 'ins_4', 'Institution 4', 'enc_4', 'active', now() - interval '1 day'
);

-- Imported history belongs to Finance, not the paid connection capability.
INSERT INTO accounts (
    id, household_id, owner_id, name, type, currency_code, balance_cents
) VALUES (
    '44050000-0000-4000-f000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'Imported History', 'checking', 'USD', 12345
);
INSERT INTO transactions (
    id, household_id, owner_id, account_id, amount_cents, currency_code,
    type, date, status
) VALUES (
    '44050000-0000-4000-f100-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    '44050000-0000-4000-f000-000000000001',
    1234, 'USD', 'expense', current_date, 'CLEARED'
);
INSERT INTO bank_connection_accounts (
    bank_connection_id, household_id, account_id, external_account_id,
    external_name, is_linked
) VALUES (
    '44050000-0000-4000-e000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-f000-000000000001',
    'external-1', 'Imported History', true
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT * FROM prepare_bank_connection_downgrade(
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000002',
            'premium',
            ARRAY[
                '44050000-0000-4000-e000-000000000001',
                '44050000-0000-4000-e000-000000000002'
            ]::UUID[]
        )
    $sql$,
    '42501',
    'a non-admin member cannot choose retained connections'
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT * FROM prepare_bank_connection_downgrade(
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            'premium',
            ARRAY[
                '44050000-0000-4000-e000-000000000003',
                '44050000-0000-4000-e000-000000000099'
            ]::UUID[]
        )
    $sql$,
    '22023',
    'a retained id must be a current live connection in the subject household'
);

-- Explicit Family -> Premium selection retains the selected newer pair.
SELECT * FROM prepare_bank_connection_downgrade(
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'premium',
    ARRAY[
        '44050000-0000-4000-e000-000000000003',
        '44050000-0000-4000-e000-000000000004'
    ]::UUID[]
);

UPDATE current_household_entitlements
SET display_tier = 'premium',
    is_premium_sponsored = true,
    bank_connection_allowance = 2
WHERE household_id = '44050000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-e000-000000000001',
            '44050000-0000-4000-e000-000000000002'
        )
          AND status = 'revocation_pending'
          AND NOT sync_enabled
          AND encrypted_access_token IS NULL
          AND deleted_at IS NULL
    )
    AND (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-e000-000000000003',
            '44050000-0000-4000-e000-000000000004'
        )
          AND status = 'active'
          AND sync_enabled
          AND encrypted_access_token IS NOT NULL
    ),
    'explicit selection disables only excess Items and never a retained Item'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
           AND bool_and(encrypted_access_token IS NOT NULL)
           AND bool_and(operation = 'downgrade')
        FROM bank_connection_orphaned_items
        WHERE connection_id IN (
            '44050000-0000-4000-e000-000000000001',
            '44050000-0000-4000-e000-000000000002'
        )
    ),
    'credential transfer and sync disablement commit into one durable outbox'
);

-- Provider outage -> bounded jittered retry -> confirmed success.
CREATE TEMP TABLE claimed_revocations AS
SELECT * FROM claim_bank_connection_revocations(1);

SELECT * FROM fail_bank_connection_revocation(
    (SELECT id FROM claimed_revocations),
    (SELECT claim_token FROM claimed_revocations),
    'PROVIDER_DOWN'
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'pending_revocation'
           AND encrypted_access_token IS NOT NULL
           AND next_attempt_at >= last_attempt_at + interval '30 seconds'
           AND next_attempt_at <= last_attempt_at + interval '37.5 seconds'
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_revocations)
    ),
    'provider outage retains the credential and schedules bounded backoff plus jitter'
);

UPDATE bank_connection_orphaned_items
SET next_attempt_at = now()
WHERE id = (SELECT id FROM claimed_revocations);
DELETE FROM claimed_revocations WHERE id IS NOT NULL;
INSERT INTO claimed_revocations SELECT * FROM claim_bank_connection_revocations(1);

SELECT pg_temp.assert_true(
    complete_bank_connection_revocation(
        (SELECT id FROM claimed_revocations),
        (SELECT claim_token FROM claimed_revocations),
        'revoked'
    ),
    'retry success completes the outbox row'
);
SELECT pg_temp.assert_true(
    complete_bank_connection_revocation(
        (SELECT id FROM claimed_revocations),
        (SELECT claim_token FROM claimed_revocations),
        'revoked'
    ),
    'completion replay is idempotent'
);

-- The second provider reports already-invalid, which is also terminal success.
DELETE FROM claimed_revocations WHERE id IS NOT NULL;
INSERT INTO claimed_revocations SELECT * FROM claim_bank_connection_revocations(1);
SELECT pg_temp.assert_true(
    complete_bank_connection_revocation(
        (SELECT id FROM claimed_revocations),
        (SELECT claim_token FROM claimed_revocations),
        'already_invalid'
    ),
    'verified already-invalid is terminal success'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
           AND bool_and(encrypted_access_token IS NULL)
           AND bool_and(deleted_at IS NOT NULL)
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-e000-000000000001',
            '44050000-0000-4000-e000-000000000002'
        )
    )
    AND (
        SELECT count(*) = 2
           AND bool_and(status IN ('revoked', 'already_invalid'))
           AND bool_and(encrypted_access_token IS NULL)
           AND bool_and(completed_at IS NOT NULL)
        FROM bank_connection_orphaned_items
        WHERE connection_id IN (
            '44050000-0000-4000-e000-000000000001',
            '44050000-0000-4000-e000-000000000002'
        )
    )
    AND EXISTS (
        SELECT 1 FROM accounts
        WHERE id = '44050000-0000-4000-f000-000000000001'
          AND balance_cents = 12345
          AND deleted_at IS NULL
    )
    AND EXISTS (
        SELECT 1 FROM transactions
        WHERE id = '44050000-0000-4000-f100-000000000001'
          AND amount_cents = 1234
          AND deleted_at IS NULL
    ),
    'terminal revocation soft-deletes only the connection and preserves history'
);

-- Restart recovery reclaims an expired lease, while unknown finalization for a
-- still-live connection is resolved as retained without touching the provider.
SELECT record_orphaned_bank_item(
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid',
    'enc_reconciliation',
    'FINALIZE_OUTCOME_UNKNOWN',
    'pending_reconciliation',
    '44050000-0000-4000-e000-000000000003'
);
SELECT * FROM claim_bank_connection_revocations(10);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'retained'
           AND encrypted_access_token IS NULL
           AND completed_at IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-e000-000000000003'
          AND operation = 'orphan_finalization'
    ),
    'finalization reconciliation never revokes an Item backing a live connection'
);

INSERT INTO bank_connection_orphaned_items (
    household_id, owner_id, provider, encrypted_access_token, status,
    operation, idempotency_key, attempts, next_attempt_at,
    claim_token, claim_expires_at
) VALUES (
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid', 'enc_restart', 'processing',
    'orphan_finalization', 'restart-probe', 1, now(),
    '44050000-0000-4000-a100-000000000001',
    now() - interval '1 second'
);
DELETE FROM claimed_revocations WHERE id IS NOT NULL;
INSERT INTO claimed_revocations SELECT * FROM claim_bank_connection_revocations(1);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM claimed_revocations c
        JOIN bank_connection_orphaned_items o USING (id)
        WHERE o.idempotency_key = 'restart-probe'
          AND o.status = 'processing'
          AND o.last_error_code = 'WORKER_LEASE_EXPIRED'
    ),
    'a worker restart reclaims an expired lease without losing the credential'
);
SELECT pg_temp.assert_true(
    complete_bank_connection_revocation(
        (SELECT id FROM claimed_revocations),
        (SELECT claim_token FROM claimed_revocations),
        'revoked'
    ),
    'restart-reclaimed work can complete normally'
);

-- Family -> Premium without a valid selection keeps oldest created_at then id.
UPDATE current_household_entitlements
SET display_tier = 'family',
    is_premium_sponsored = false,
    bank_connection_allowance = 4
WHERE household_id = '44050000-0000-4000-9000-000000000001';

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, created_at
) VALUES
(
    '44050000-0000-4000-e000-000000000005',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid', 'ins_5', 'Institution 5', 'enc_5', 'active', now()
),
(
    '44050000-0000-4000-e000-000000000006',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'mx', 'ins_6', 'Institution 6', 'enc_6', 'active', now()
);

UPDATE current_household_entitlements
SET display_tier = 'premium',
    is_premium_sponsored = true,
    bank_connection_allowance = 2
WHERE household_id = '44050000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-e000-000000000003',
            '44050000-0000-4000-e000-000000000004'
        )
          AND sync_enabled
    )
    AND (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-e000-000000000005',
            '44050000-0000-4000-e000-000000000006'
        )
          AND status = 'revocation_pending'
    ),
    'Family to Premium fallback retains at most the oldest two by created_at then id'
);

-- Premium -> Free/Plus has a zero household allowance and revokes all excess.
UPDATE current_household_entitlements
SET display_tier = 'free',
    is_premium_sponsored = false,
    bank_connection_allowance = 0,
    source_base_grant_id = NULL,
    expires_at = NULL
WHERE household_id = '44050000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM bank_connections
        WHERE household_id = '44050000-0000-4000-9000-000000000001'
          AND deleted_at IS NULL
          AND sync_enabled
    ),
    'Premium to Free/Plus fallback disables every live Item immediately'
);

-- Account erasure enqueues before row deletion and severs durable beneficiary
-- identity while processor work remains retryable.
SELECT pg_temp.assert_true(
    prepare_bank_connection_erasure(
        '44050000-0000-4000-8000-000000000001',
        ARRAY['44050000-0000-4000-9000-000000000001']::UUID[]
    ) >= 0,
    'account erasure handoff completes'
);
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE operation = 'account_deletion'
          AND (owner_id IS NOT NULL OR household_id IS NOT NULL)
    ),
    'account erasure promptly severs user and household identity from retry work'
);

-- Exhausted credentials remain only inside the hard ceiling and expose a
-- secret-safe aggregate status.
UPDATE bank_connection_orphaned_items
SET status = 'pending_revocation',
    attempts = 0,
    max_attempts = 1,
    next_attempt_at = now(),
    claim_token = NULL,
    claim_expires_at = NULL
WHERE id = (
    SELECT id
    FROM bank_connection_orphaned_items
    WHERE encrypted_access_token IS NOT NULL
    ORDER BY created_at, id
    LIMIT 1
);

DELETE FROM claimed_revocations WHERE id IS NOT NULL;
INSERT INTO claimed_revocations SELECT * FROM claim_bank_connection_revocations(1);
SELECT * FROM fail_bank_connection_revocation(
    (SELECT id FROM claimed_revocations),
    (SELECT claim_token FROM claimed_revocations),
    'PROVIDER_OUTAGE'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'exhausted' AND encrypted_access_token IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_revocations)
    )
    AND EXISTS (
        SELECT 1 FROM bank_connection_revocation_status()
        WHERE status = 'exhausted' AND item_count >= 1
    ),
    'exhausted work retains capability only as an alertable bounded exception'
);

UPDATE bank_connection_orphaned_items
SET retain_until = now() - interval '1 second'
WHERE id = (SELECT id FROM claimed_revocations);
SELECT * FROM purge_expired_orphaned_bank_items();
SELECT pg_temp.assert_true(
    (
        SELECT status = 'abandoned'
           AND encrypted_access_token IS NULL
           AND completed_at IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_revocations)
    ),
    'retention ceiling purges an exhausted credential'
);

-- Outbox fields remain minimized: no names, amounts, raw payload, or plaintext
-- credential columns can be added unnoticed.
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'bank_connection_orphaned_items'
          AND column_name IN (
              'name', 'institution_name', 'amount', 'amount_cents',
              'raw_payload', 'payload', 'access_token'
          )
    ),
    'the server-only outbox contains no PII, financial values, raw payload, or plaintext'
);

ROLLBACK;

\echo 'durable-bank-revocation.test.sql: all assertions passed'
