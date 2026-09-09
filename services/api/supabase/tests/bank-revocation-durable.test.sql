-- SPDX-License-Identifier: BUSL-1.1

\set ON_ERROR_STOP on

-- Durable downgrade/revocation integration suite (#4405).
-- Run only against the disposable local Supabase PostgreSQL instance.

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

-- ---------------------------------------------------------------------------
-- Least privilege, RLS, pinned search paths, and privacy boundary
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'public.bank_connection_retention_selections'::regclass
    )
    AND NOT has_table_privilege(
        'authenticated', 'bank_connection_retention_selections', 'SELECT'
    )
    AND NOT has_table_privilege(
        'anon', 'bank_connection_retention_selections', 'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated', 'bank_connection_orphaned_items', 'SELECT'
    ),
    'selection and encrypted outbox tables must be RLS-protected and client-inaccessible'
);

SELECT pg_temp.assert_true(
    NOT has_function_privilege(
        'authenticated',
        'save_bank_connection_retention_selection(uuid,uuid,uuid[])',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated', 'request_bank_connection_revocation(uuid,uuid)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated', 'claim_bank_revocation_jobs(integer,integer)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon', 'bank_revocation_reconciliation_summary()', 'EXECUTE'
    )
    AND to_regprocedure('public.complete_orphaned_bank_item(uuid,text,text)') IS NULL
    AND to_regprocedure('public.record_orphaned_bank_item_attempt(uuid,text)') IS NULL
    AND to_regprocedure(
        'public.claim_orphaned_bank_items_for_erasure(uuid,uuid[])'
    ) IS NULL,
    'no durable revocation RPC may be client executable or bypass the lease state machine'
);

SELECT pg_temp.assert_true(
    has_function_privilege(
        'service_role',
        'save_bank_connection_retention_selection(uuid,uuid,uuid[])',
        'EXECUTE'
    )
    AND has_function_privilege(
        'service_role', 'request_bank_connection_revocation(uuid,uuid)', 'EXECUTE'
    )
    AND has_function_privilege(
        'service_role', 'claim_bank_revocation_jobs(integer,integer)', 'EXECUTE'
    )
    AND has_function_privilege(
        'service_role',
        'record_bank_revocation_result(uuid,uuid,boolean,text)',
        'EXECUTE'
    ),
    'the least-privilege server role must be able to drive the workflow'
);

SELECT pg_temp.assert_true(
    (
        SELECT bool_and(p.proconfig @> ARRAY['search_path=public'])
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'enqueue_bank_connection_revocation_internal',
              'request_bank_connection_revocation',
              'save_bank_connection_retention_selection',
              'enforce_bank_connection_allowance_internal',
              'enforce_due_bank_connection_downgrades',
              'claim_bank_revocation_jobs',
              'record_bank_revocation_result',
              'recover_exhausted_bank_revocations',
              'bank_revocation_reconciliation_summary',
              'sever_bank_revocation_identities_for_account'
          )
    ),
    'every SECURITY DEFINER revocation function must pin search_path=public'
);

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
    'no client-executable function may read the credential-bearing outbox'
);

-- ---------------------------------------------------------------------------
-- Server-authoritative household and entitlement fixture
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
    '44050000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'revocation-4405@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO users (id, email, display_name) VALUES (
    '44050000-0000-4000-8000-000000000001',
    'revocation-user-4405@example.invalid',
    'Revocation Owner'
);

INSERT INTO households (id, name, created_by) VALUES (
    '44050000-0000-4000-9000-000000000001',
    'Durable Revocation Household',
    '44050000-0000-4000-8000-000000000001'
);

INSERT INTO household_members (id, household_id, user_id, role) VALUES (
    '44050000-0000-4000-a000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'owner'
);

INSERT INTO billing_accounts (id, owner_id) VALUES (
    '44050000-0000-4000-b000-000000000001',
    '44050000-0000-4000-8000-000000000001'
);

INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
)
VALUES (
    '44050000-0000-4000-c000-000000000001',
    '44050000-0000-4000-b000-000000000001',
    'stripe', 'sandbox', 'cus_revocation_4405', true
);

SELECT pg_temp.assert_true(
    apply_billing_provider_event(record_billing_provider_event(
        '44050000-0000-4000-b000-000000000001',
        '44050000-0000-4000-c000-000000000001',
        'stripe', 'sandbox',
        'evt_4405_premium', 'sub_4405_premium', NULL,
        now(), now() - interval '2 days', 10,
        'activated', 'active', 'base_plan', 'premium', 1,
        now() + interval '30 days',
        NULL, NULL, NULL
    )),
    'Premium entitlement fixture must apply through the authoritative ledger'
);

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

-- Simulate the current Family grant while preserving the real source subject
-- and expiry produced above. Stage 5 owns tier math; this suite owns what
-- happens when the resulting allowance changes.
UPDATE current_household_entitlements
SET display_tier = 'family',
    is_premium_sponsored = false,
    bank_connection_allowance = 4
WHERE household_id = '44050000-0000-4000-9000-000000000001';

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, created_at
)
VALUES
    (
        '44050000-0000-4000-d000-000000000001',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'plaid', 'ins_1', 'Institution 1', 'enc_1', 'active',
        '2026-09-01T00:00:00Z'
    ),
    (
        '44050000-0000-4000-d000-000000000002',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'plaid', 'ins_2', 'Institution 2', 'enc_2', 'active',
        '2026-09-01T00:00:00Z'
    ),
    (
        '44050000-0000-4000-d000-000000000003',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'plaid', 'ins_3', 'Institution 3', 'enc_3', 'active',
        '2026-09-01T00:00:00Z'
    ),
    (
        '44050000-0000-4000-d000-000000000004',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'mx', 'ins_4', 'Institution 4', 'enc_4', 'active',
        '2026-09-01T00:00:00Z'
    );

INSERT INTO bank_connection_accounts (
    id, bank_connection_id, household_id, external_account_id, external_name
)
VALUES (
    '44050000-0000-4000-e000-000000000001',
    '44050000-0000-4000-d000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    'external-history-1',
    'Imported history'
);

SELECT pg_temp.expect_error(
    $sql$
        UPDATE bank_connections
        SET status = 'revocation_pending',
            encrypted_access_token = NULL
        WHERE id = '44050000-0000-4000-d000-000000000004'
    $sql$,
    '23514',
    'a pending state without the server-authored durable handoff marker is rejected'
);

UPDATE bank_connections
SET status = 'needs_reauth'
WHERE id = '44050000-0000-4000-d000-000000000001';

-- ---------------------------------------------------------------------------
-- Explicit retained selection and Family -> Premium
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT status = 'saved' AND selected_count = 2
        FROM save_bank_connection_retention_selection(
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            ARRAY[
                '44050000-0000-4000-d000-000000000003',
                '44050000-0000-4000-d000-000000000004'
            ]::UUID[]
        )
    ),
    'an authenticated owner can save a current-live selection'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'invalid_selection'
        FROM save_bank_connection_retention_selection(
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            ARRAY['44050000-0000-4000-d000-000000000099']::UUID[]
        )
    ),
    'a selection containing a non-live or cross-household id is rejected'
);

-- The invalid request does not overwrite the valid selection. Move its
-- server-resolved boundary into the past to model the scheduled transition,
-- then advance the same grant by two projection versions.
UPDATE bank_connection_retention_selections
SET entitlement_expires_at = now() - interval '1 second'
WHERE household_id = '44050000-0000-4000-9000-000000000001';

UPDATE current_household_entitlements
SET display_tier = 'premium',
    is_premium_sponsored = true,
    bank_connection_allowance = 2,
    projection_version = projection_version + 2
WHERE household_id = '44050000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-d000-000000000003',
            '44050000-0000-4000-d000-000000000004'
        )
          AND status = 'active'
          AND encrypted_access_token IS NOT NULL
          AND deleted_at IS NULL
    ),
    'the explicit selection, not age ordering, retains the chosen two connections'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-d000-000000000001',
            '44050000-0000-4000-d000-000000000002'
        )
          AND status = 'revocation_pending'
          AND encrypted_access_token IS NULL
          AND deleted_at IS NULL
    )
    AND (
        SELECT count(*) = 2
        FROM bank_connection_orphaned_items
        WHERE reason = 'entitlement_downgrade'
          AND encrypted_access_token IS NOT NULL
    ),
    'excess connections are disabled and credential-handoff is atomic'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1 AND min(used) = 2
        FROM bank_connection_capacity(
            '44050000-0000-4000-9000-000000000001'
        )
    ),
    'revocation_pending history releases Stage 6 capacity immediately'
);

SELECT pg_temp.assert_true(
    (
        SELECT connection_previous_status = 'needs_reauth'
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000001'
    ),
    'enqueue preserves the exact live status for a reversible rollback'
);

SELECT pg_temp.assert_true(
    (
        SELECT revocation_enqueued_at IS NOT NULL
        FROM bank_connections
        WHERE id = '44050000-0000-4000-d000-000000000001'
    ),
    'the connection keeps a server-authored marker after outbox identity severance'
);

SELECT pg_temp.expect_error(
    $sql$
        UPDATE bank_connections
        SET status = 'active',
            encrypted_access_token = 'enc_reactivated',
            revocation_enqueued_at = NULL
        WHERE id = '44050000-0000-4000-d000-000000000001'
    $sql$,
    '23514',
    'status-only reactivation cannot bypass the household cap'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM bank_connection_accounts
        WHERE id = '44050000-0000-4000-e000-000000000001'
    ),
    'disabling a connection preserves imported account and financial history linkage'
);

-- ---------------------------------------------------------------------------
-- Retry, exhaustion, bounded recovery, terminal purge, and idempotency
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE claimed_job AS
SELECT * FROM claim_bank_revocation_jobs(1, 60);

SELECT pg_temp.assert_true(
    (SELECT count(*) = 1 FROM claimed_job)
    AND (
        SELECT status = 'processing'
           AND attempts = 1
           AND encrypted_access_token IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_job)
    ),
    'the worker claims one encrypted job with a lease'
);

SELECT pg_temp.assert_true(
    (
        SELECT record_bank_revocation_result(id, lease_token, false, 'PROVIDER_DOWN')
        FROM claimed_job
    ) = 'retry_wait',
    'provider outage remains a failure and schedules retry'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'retry_wait'
           AND next_attempt_at > now()
           AND next_attempt_at < now() + interval '1 hour'
           AND encrypted_access_token IS NOT NULL
           AND last_error_code = 'PROVIDER_DOWN'
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_job)
    ),
    'retry is bounded, jittered, and retains the only revocation credential'
);

UPDATE bank_connection_orphaned_items
SET attempts = max_attempts - 1,
    next_attempt_at = now()
WHERE id = (SELECT id FROM claimed_job);

DELETE FROM claimed_job WHERE true;
INSERT INTO claimed_job SELECT * FROM claim_bank_revocation_jobs(1, 60);

SELECT pg_temp.assert_true(
    (
        SELECT record_bank_revocation_result(id, lease_token, false, 'DECRYPT_FAILED')
        FROM claimed_job
    ) = 'exhausted',
    'the final bounded failure reaches operator-visible exhaustion'
);

SELECT pg_temp.assert_true(
    recover_exhausted_bank_revocations(1) = 1,
    'an exhausted job receives its first bounded recovery'
);
UPDATE bank_connection_orphaned_items
SET status = 'exhausted', next_attempt_at = NULL
WHERE id = (SELECT id FROM claimed_job);
SELECT pg_temp.assert_true(
    recover_exhausted_bank_revocations(1) = 1,
    'an exhausted job receives its second bounded recovery'
);
UPDATE bank_connection_orphaned_items
SET status = 'exhausted', next_attempt_at = NULL
WHERE id = (SELECT id FROM claimed_job);
SELECT pg_temp.assert_true(
    recover_exhausted_bank_revocations(1) = 0,
    'exhausted recovery cannot be repeated without bound'
);

SELECT enqueue_bank_connection_revocation_internal(
    (SELECT connection_id FROM bank_connection_orphaned_items WHERE id = (SELECT id FROM claimed_job)),
    'account_deletion',
    false
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'pending_revocation'
           AND attempts = 0
           AND recovery_attempts = 2
           AND reason = 'account_deletion'
           AND next_attempt_at <= now()
           AND last_error_code IS NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_job)
    ),
    'a new account-deletion reason makes an exhausted job immediately claimable'
);

-- Finish the recovered job, then prove a duplicate result cannot transition it
-- or perform a second database-side terminal action.
UPDATE bank_connection_orphaned_items
SET status = 'pending_revocation',
    attempts = 0,
    next_attempt_at = now(),
    recovery_attempts = 2
WHERE id = (SELECT id FROM claimed_job);
DELETE FROM claimed_job WHERE true;
INSERT INTO claimed_job SELECT * FROM claim_bank_revocation_jobs(1, 60);
SELECT pg_temp.assert_true(
    (
        SELECT record_bank_revocation_result(id, lease_token, true, 'ALREADY_INVALID')
        FROM claimed_job
    ) = 'revoked',
    'verified already-invalid is terminal success'
);
SELECT pg_temp.assert_true(
    (
        SELECT record_bank_revocation_result(id, lease_token, true, NULL)
        FROM claimed_job
    ) = 'stale',
    'duplicate delivery is idempotent after terminal disposition'
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'revoked'
           AND encrypted_access_token IS NULL
           AND revoked_at IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_job)
    ),
    'terminal success purges the credential atomically'
);

-- Complete the other explicit-selection outbox job so only retained live rows
-- consume the next Family allowance fixture.
DELETE FROM claimed_job WHERE true;
INSERT INTO claimed_job SELECT * FROM claim_bank_revocation_jobs(1, 60);
SELECT record_bank_revocation_result(id, lease_token, true, NULL) FROM claimed_job;

-- ---------------------------------------------------------------------------
-- No-selection fallback: created_at then id; Premium -> Free revokes all
-- ---------------------------------------------------------------------------

UPDATE current_household_entitlements
SET display_tier = 'family',
    is_premium_sponsored = false,
    bank_connection_allowance = 4
WHERE household_id = '44050000-0000-4000-9000-000000000001';

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, created_at
)
VALUES
    (
        '44050000-0000-4000-d000-000000000005',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'plaid', 'ins_5', 'Institution 5', 'enc_5', 'active',
        '2026-09-01T00:00:00Z'
    ),
    (
        '44050000-0000-4000-d000-000000000006',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'mx', 'ins_6', 'Institution 6', 'enc_6', 'active',
        '2026-09-01T00:00:00Z'
    );

DELETE FROM bank_connection_retention_selections
WHERE household_id = '44050000-0000-4000-9000-000000000001';

UPDATE current_household_entitlements
SET display_tier = 'premium',
    is_premium_sponsored = true,
    bank_connection_allowance = 2
WHERE household_id = '44050000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT array_agg(id ORDER BY id) = ARRAY[
            '44050000-0000-4000-d000-000000000003',
            '44050000-0000-4000-d000-000000000004'
        ]::UUID[]
        FROM bank_connections
        WHERE status = 'active' AND deleted_at IS NULL
    ),
    'fallback retains the two oldest connections and breaks created_at ties by id'
);

-- User disconnect is also enqueue-before-delete and never calls a provider in
-- the request transaction.
SELECT pg_temp.assert_true(
    (
        SELECT status = 'queued'
        FROM request_bank_connection_revocation(
            '44050000-0000-4000-d000-000000000003',
            '44050000-0000-4000-8000-000000000001'
        )
    ),
    'authenticated disconnect is durably queued'
);

CREATE TEMP TABLE released_capacity AS
SELECT * FROM reserve_bank_connection_slot(
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid',
    60
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'reserved' AND used = 2
        FROM released_capacity
    ),
    'disconnect releases capacity before provider revocation completes'
);
SELECT pg_temp.assert_true(
    (
        SELECT release_bank_connection_reservation(
            reservation_id,
            '44050000-0000-4000-9000-000000000001'
        )
        FROM released_capacity
    ),
    'the capacity proof releases its temporary reservation'
);

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
        WHERE deleted_at IS NULL
          AND status IN ('active', 'needs_reauth', 'error')
    ),
    'Premium to Free/Plus disables every remaining live provider Item'
);

-- ---------------------------------------------------------------------------
-- Account deletion: durable processor erasure plus identity severance
-- ---------------------------------------------------------------------------

SELECT sever_bank_revocation_identities_for_account(
    '44050000-0000-4000-8000-000000000001',
    ARRAY['44050000-0000-4000-9000-000000000001']::UUID[]
);

SELECT pg_temp.assert_true(
    sever_bank_revocation_identities_for_account(
        '44050000-0000-4000-8000-000000000001',
        ARRAY['44050000-0000-4000-9000-000000000001']::UUID[]
    ) = 0,
    'account-deletion identity severance is idempotent after the first durable handoff'
);

UPDATE bank_connection_orphaned_items
SET retain_until = now() - interval '1 second'
WHERE id = (
    SELECT id
    FROM bank_connection_orphaned_items
    WHERE reason = 'account_deletion'
      AND status IN ('pending_revocation', 'retry_wait', 'exhausted')
    ORDER BY created_at, id
    LIMIT 1
);
SELECT * FROM purge_expired_orphaned_bank_items();
SELECT pg_temp.assert_true(
    sever_bank_revocation_identities_for_account(
        '44050000-0000-4000-8000-000000000001',
        ARRAY['44050000-0000-4000-9000-000000000001']::UUID[]
    ) = 0,
    'account deletion remains retryable after a severed outbox row is terminally abandoned'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE owner_id IS NOT NULL
           OR household_id IS NOT NULL
           OR connection_id IS NOT NULL
    )
    AND EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE reason = 'account_deletion'
          AND encrypted_access_token IS NOT NULL
          AND erasure_requested_at IS NOT NULL
          AND retain_until <= now() + interval '7 days'
    ),
    'account deletion severs identity while durable processor erasure remains retryable'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM bank_revocation_reconciliation_summary()
        WHERE status IN ('pending_revocation', 'exhausted')
          AND jobs > 0
    ),
    'operators can see safe exhausted/pending counts without credentials or identities'
);

SELECT pg_temp.expect_error(
    $sql$
        UPDATE bank_connection_orphaned_items
        SET encrypted_access_token = NULL
        WHERE status = 'pending_revocation'
    $sql$,
    '23514',
    'a non-terminal job cannot lose its revocation credential'
);

ROLLBACK;

\echo 'bank-revocation-durable.test.sql: all assertions passed'
