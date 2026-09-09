-- SPDX-License-Identifier: BUSL-1.1

\set ON_ERROR_STOP on

-- Real PostgreSQL integration coverage for durable downgrade/revocation (#4405).
-- Runs only against the disposable Supabase CI database and rolls back.
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

-- ---------------------------------------------------------------------------
-- Server-only surface, pinned SECURITY DEFINER boundaries, and RLS
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
    (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'bank_connection_orphaned_items'::regclass
    )
    AND (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'bank_connection_retention_selections'::regclass
    ),
    'outbox and retention selections must have RLS enabled'
);

SELECT pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'bank_connection_orphaned_items', 'SELECT')
    AND NOT has_table_privilege('anon', 'bank_connection_orphaned_items', 'SELECT')
    AND NOT has_table_privilege(
        'authenticated', 'bank_connection_retention_selections', 'SELECT'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'select_bank_connections_for_downgrade(uuid,uuid,text,uuid[])',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'claim_bank_revocation_jobs(uuid,integer,integer)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'guard_bank_connection_provider_lifecycle()',
        'EXECUTE'
    ),
    'clients cannot read or execute any revocation outbox surface'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'select_bank_connections_for_downgrade',
              'enqueue_bank_connection_revocation',
              'enqueue_bank_revocations_for_erasure',
              'reconcile_bank_connections_to_allowance',
              'reconcile_all_bank_connection_allowances',
              'claim_bank_revocation_jobs',
              'resolve_bank_revocation_reconciliation',
              'complete_bank_revocation_job',
              'fail_bank_revocation_job',
              'bank_revocation_reconciliation_status',
              'guard_bank_connection_provider_lifecycle'
          )
          AND NOT (p.proconfig @> ARRAY['search_path=public'])
    ),
    'every SECURITY DEFINER revocation function pins search_path'
);

-- ---------------------------------------------------------------------------
-- Fixtures: one real Family projection, then two projection-only households.
-- Projection derivation itself is covered by billing-entitlements integration;
-- this suite begins at that sole-authority boundary.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '44050000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'revocation-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
), (
    '44050000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'revocation-outsider@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO users (id, email, display_name) VALUES
    (
        '44050000-0000-4000-8000-000000000001',
        'revocation-owner@example.invalid',
        'Revocation Owner'
    ),
    (
        '44050000-0000-4000-8000-000000000002',
        'revocation-outsider@example.invalid',
        'Revocation Outsider'
    );

INSERT INTO households (id, name, created_by) VALUES
    (
        '44050000-0000-4000-9000-000000000001',
        'Explicit Selection Household',
        '44050000-0000-4000-8000-000000000001'
    ),
    (
        '44050000-0000-4000-9000-000000000002',
        'Fallback Household',
        '44050000-0000-4000-8000-000000000001'
    ),
    (
        '44050000-0000-4000-9000-000000000003',
        'Erasure Household',
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
    ),
    (
        '44050000-0000-4000-a000-000000000003',
        '44050000-0000-4000-9000-000000000002',
        '44050000-0000-4000-8000-000000000001',
        'owner'
    ),
    (
        '44050000-0000-4000-a000-000000000004',
        '44050000-0000-4000-9000-000000000003',
        '44050000-0000-4000-8000-000000000001',
        'owner'
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
    'stripe', 'sandbox', 'cus_revocation_4405', true
);

SELECT pg_temp.assert_true(
    apply_billing_provider_event(record_billing_provider_event(
        '44050000-0000-4000-b000-000000000001',
        '44050000-0000-4000-c000-000000000001',
        'stripe', 'sandbox',
        'evt_revocation_family', 'sub_revocation_family', NULL,
        now(), now() - interval '2 days', 1,
        'activated', 'active', 'base_plan', 'family', 1,
        now() + interval '30 days',
        NULL, NULL,
        '44050000-0000-4000-9000-000000000001'
    )),
    'Family fixture must apply through the real entitlement ledger'
);

-- Reuse the real grant only to seed additional minimized projection fixtures.
-- The outbox consumes this table as the sole authority and never reinterprets
-- provider evidence.
UPDATE current_household_entitlements target
SET display_tier = fixture.display_tier,
    is_premium_sponsored = fixture.is_premium_sponsored,
    bank_connection_allowance = fixture.bank_connection_allowance,
    source_base_grant_id = source.source_base_grant_id,
    effective_at = source.effective_at,
    expires_at = source.expires_at
FROM (
    VALUES
        ('44050000-0000-4000-9000-000000000002'::UUID, 'family'::TEXT, false, 4::BIGINT),
        ('44050000-0000-4000-9000-000000000003'::UUID, 'premium'::TEXT, true, 2::BIGINT)
) AS fixture(household_id, display_tier, is_premium_sponsored, bank_connection_allowance)
CROSS JOIN (
    SELECT source_base_grant_id, effective_at, expires_at
    FROM current_household_entitlements
    WHERE household_id = '44050000-0000-4000-9000-000000000001'
) source
WHERE target.household_id = fixture.household_id;

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, created_at
) VALUES
    (
        '44050000-0000-4000-e000-000000000001',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'plaid', 'explicit-1', 'Explicit One', 'enc_explicit_1', 'active',
        now() - interval '4 days'
    ),
    (
        '44050000-0000-4000-e000-000000000002',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'mx', 'explicit-2', 'Explicit Two', 'enc_explicit_2', 'active',
        now() - interval '3 days'
    ),
    (
        '44050000-0000-4000-e000-000000000003',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'plaid', 'explicit-3', 'Explicit Three', 'enc_explicit_3', 'active',
        now() - interval '2 days'
    ),
    (
        '44050000-0000-4000-e000-000000000004',
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000001',
        'mx', 'explicit-4', 'Explicit Four', 'enc_explicit_4', 'active',
        now() - interval '1 day'
    ),
    (
        '44050000-0000-4000-f000-000000000001',
        '44050000-0000-4000-9000-000000000002',
        '44050000-0000-4000-8000-000000000001',
        'plaid', 'fallback-1', 'Fallback One', 'enc_fallback_1', 'active',
        '2030-01-01 00:00:00+00'
    ),
    (
        '44050000-0000-4000-f000-000000000002',
        '44050000-0000-4000-9000-000000000002',
        '44050000-0000-4000-8000-000000000001',
        'mx', 'fallback-2', 'Fallback Two', 'enc_fallback_2', 'active',
        '2030-01-01 00:00:00+00'
    ),
    (
        '44050000-0000-4000-f000-000000000003',
        '44050000-0000-4000-9000-000000000002',
        '44050000-0000-4000-8000-000000000001',
        'plaid', 'fallback-3', 'Fallback Three', 'enc_fallback_3', 'active',
        '2030-01-02 00:00:00+00'
    ),
    (
        '44050000-0000-4000-f000-000000000004',
        '44050000-0000-4000-9000-000000000002',
        '44050000-0000-4000-8000-000000000001',
        'mx', 'fallback-4', 'Fallback Four', 'enc_fallback_4', 'active',
        '2030-01-03 00:00:00+00'
    );

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44050000-0000-4000-8000-000000000001',
    true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
    BEGIN
        UPDATE bank_connections
        SET status = 'revocation_pending'
        WHERE id = '44050000-0000-4000-e000-000000000004';
        RAISE EXCEPTION 'direct provider lifecycle update was not blocked';
    EXCEPTION
        WHEN insufficient_privilege THEN
            IF SQLERRM <> 'bank connection provider lifecycle requires the server API' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        DELETE FROM bank_connections
        WHERE id = '44050000-0000-4000-e000-000000000004';
        RAISE EXCEPTION 'direct provider lifecycle delete was not blocked';
    EXCEPTION
        WHEN insufficient_privilege THEN
            IF SQLERRM <> 'bank connection provider lifecycle requires the server API' THEN
                RAISE;
            END IF;
    END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- Explicit selection authorization and validation
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
    (
        SELECT status = 'forbidden'
        FROM select_bank_connections_for_downgrade(
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000002',
            'premium',
            ARRAY[
                '44050000-0000-4000-e000-000000000003',
                '44050000-0000-4000-e000-000000000004'
            ]::UUID[]
        )
    ),
    'a non-admin household member cannot select retained Items'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'invalid_selection'
        FROM select_bank_connections_for_downgrade(
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            'premium',
            ARRAY['44050000-0000-4000-e000-000000000003']::UUID[]
        )
    ),
    'a selection with the wrong cardinality is rejected'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'invalid_selection'
        FROM select_bank_connections_for_downgrade(
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            'premium',
            ARRAY[
                '44050000-0000-4000-e000-000000000003',
                '44050000-0000-4000-f000-000000000004'
            ]::UUID[]
        )
    ),
    'a cross-household selection is rejected'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'selected' AND selected_count = 2 AND target_allowance = 2
        FROM select_bank_connections_for_downgrade(
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            'premium',
            ARRAY[
                '44050000-0000-4000-e000-000000000003',
                '44050000-0000-4000-e000-000000000004'
            ]::UUID[]
        )
    ),
    'an owner can retain two current Family Items for Premium'
);

UPDATE current_household_entitlements
SET display_tier = 'premium',
    is_premium_sponsored = true,
    bank_connection_allowance = 8
WHERE household_id = '44050000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-e000-000000000003',
            '44050000-0000-4000-e000-000000000004'
        )
          AND status = 'active'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE connection_id IN (
            '44050000-0000-4000-e000-000000000003',
            '44050000-0000-4000-e000-000000000004'
        )
    ),
    'no explicitly retained Item is revoked or enqueued'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-e000-000000000001',
            '44050000-0000-4000-e000-000000000002'
        )
          AND status = 'revocation_pending'
    )
    AND (
        SELECT count(*) = 2
        FROM bank_connection_orphaned_items
        WHERE connection_id IN (
            '44050000-0000-4000-e000-000000000001',
            '44050000-0000-4000-e000-000000000002'
        )
          AND source_reason = 'downgrade'
          AND status = 'pending_revocation'
    ),
    'every excess Item stops synchronizing and is durably enqueued atomically'
);

-- ---------------------------------------------------------------------------
-- Deterministic catalog fallbacks
-- ---------------------------------------------------------------------------
UPDATE current_household_entitlements
SET display_tier = 'premium',
    is_premium_sponsored = true,
    bank_connection_allowance = 8
WHERE household_id = '44050000-0000-4000-9000-000000000002';

SELECT pg_temp.assert_true(
    (
        SELECT array_agg(id ORDER BY id) = ARRAY[
            '44050000-0000-4000-f000-000000000001'::UUID,
            '44050000-0000-4000-f000-000000000002'::UUID
        ]
        FROM bank_connections
        WHERE household_id = '44050000-0000-4000-9000-000000000002'
          AND status = 'active'
    ),
    'Family to Premium fallback keeps the oldest two using id to break ties'
);

UPDATE current_household_entitlements
SET display_tier = 'free',
    is_premium_sponsored = false,
    bank_connection_allowance = 0,
    source_base_grant_id = NULL,
    expires_at = NULL
WHERE household_id = '44050000-0000-4000-9000-000000000002';

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM bank_connections
        WHERE household_id = '44050000-0000-4000-9000-000000000002'
          AND deleted_at IS NULL
          AND status NOT IN ('revocation_pending', 'disconnected')
    ),
    'Premium to Free or Plus fallback disables every remaining Item'
);

-- ---------------------------------------------------------------------------
-- Worker lease, outage/backoff, restart, already-invalid, and history
-- ---------------------------------------------------------------------------
INSERT INTO accounts (
    id, household_id, owner_id, name, type, currency_code, balance_cents
) VALUES (
    '44050000-0000-4000-8100-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'Imported Account', 'CHECKING', 'USD', 12345
);
INSERT INTO transactions (
    id, household_id, account_id, owner_id, amount_cents, currency_code, type, date
) VALUES (
    '44050000-0000-4000-8200-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8100-000000000001',
    '44050000-0000-4000-8000-000000000001',
    -1250, 'USD', 'EXPENSE', current_date
);
INSERT INTO bank_connection_accounts (
    id, bank_connection_id, household_id, account_id,
    external_account_id, external_name, is_linked
) VALUES (
    '44050000-0000-4000-8300-000000000001',
    '44050000-0000-4000-e000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8100-000000000001',
    'external-1', 'Imported Account', true
);

CREATE TEMP TABLE imported_history_snapshot AS
SELECT balance_cents
FROM accounts
WHERE id = '44050000-0000-4000-8100-000000000001';

CREATE TEMP TABLE first_claim AS
SELECT *
FROM claim_bank_revocation_jobs(
    '44050000-0000-4000-8400-000000000001',
    1,
    120
);

SELECT pg_temp.assert_true(
    (SELECT count(*) = 1 FROM first_claim)
    AND (
        SELECT count(*) = 0
        FROM claim_bank_revocation_jobs(
            '44050000-0000-4000-8400-000000000002',
            100,
            120
        )
        WHERE id = (SELECT id FROM first_claim)
    ),
    'FOR UPDATE SKIP LOCKED lease prevents concurrent workers claiming one job'
);

UPDATE bank_connection_orphaned_items
SET claimed_by = NULL,
    claim_expires_at = NULL,
    next_attempt_at = now()
WHERE claimed_by = '44050000-0000-4000-8400-000000000002';

SELECT pg_temp.assert_true(
    (
        SELECT status IN ('pending_revocation', 'pending_reconciliation')
           AND next_attempt_at > statement_timestamp()
        FROM fail_bank_revocation_job(
            (SELECT id FROM first_claim),
            '44050000-0000-4000-8400-000000000001',
            'PROVIDER_OUTAGE'
        )
    )
    AND (
        SELECT encrypted_access_token IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM first_claim)
    ),
    'provider outage schedules bounded backoff and preserves the retry credential'
);

UPDATE bank_connection_orphaned_items
SET next_attempt_at = '2000-01-01 00:00:00+00'
WHERE id = (SELECT id FROM first_claim);

CREATE TEMP TABLE retry_claim AS
SELECT *
FROM claim_bank_revocation_jobs(
    '44050000-0000-4000-8400-000000000002',
    1,
    120
)
WHERE id = (SELECT id FROM first_claim);

SELECT pg_temp.assert_true(
    complete_bank_revocation_job(
        (SELECT id FROM retry_claim),
        '44050000-0000-4000-8400-000000000002',
        true
    ),
    'verified already-invalid is a successful terminal disposition'
);

SELECT pg_temp.assert_true(
    (
        SELECT status = 'revoked'
           AND encrypted_access_token IS NULL
           AND last_error_code = 'ALREADY_INVALID'
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM first_claim)
    )
    AND (
        SELECT status = 'disconnected'
           AND deleted_at IS NOT NULL
           AND encrypted_access_token IS NULL
        FROM bank_connections
        WHERE id = (
            SELECT connection_id FROM first_claim
        )
    ),
    'terminal success purges both credential copies and completes soft delete'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1 FROM accounts
        WHERE id = '44050000-0000-4000-8100-000000000001'
          AND balance_cents = (SELECT balance_cents FROM imported_history_snapshot)
          AND deleted_at IS NULL
    )
    AND EXISTS (
        SELECT 1 FROM transactions
        WHERE id = '44050000-0000-4000-8200-000000000001'
          AND amount_cents = -1250
          AND deleted_at IS NULL
    )
    AND EXISTS (
        SELECT 1 FROM bank_connection_accounts
        WHERE id = '44050000-0000-4000-8300-000000000001'
    ),
    'revocation preserves imported accounts, balances, transactions, and linkage history'
);

SELECT pg_temp.assert_true(
    NOT complete_bank_revocation_job(
        (SELECT id FROM first_claim),
        '44050000-0000-4000-8400-000000000002',
        false
    ),
    'duplicate worker delivery cannot repeat a terminal destructive side effect'
);

-- A crashed worker's lease expires and a restarted worker can reclaim the row.
CREATE TEMP TABLE restart_target AS
SELECT id, connection_id
FROM bank_connection_orphaned_items
WHERE connection_id IN (
    '44050000-0000-4000-e000-000000000001',
    '44050000-0000-4000-e000-000000000002'
)
  AND status = 'pending_revocation'
LIMIT 1;

UPDATE bank_connection_orphaned_items
SET claimed_by = '44050000-0000-4000-8400-000000000099',
    claim_expires_at = now() - interval '1 second',
    next_attempt_at = '2000-01-01 00:00:00+00'
WHERE id = (SELECT id FROM restart_target);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM claim_bank_revocation_jobs(
            '44050000-0000-4000-8400-000000000003',
            1,
            120
        )
        WHERE id = (SELECT id FROM restart_target)
    ),
    'worker restart reclaims an expired lease'
);

-- Reconciliation ambiguity never authorizes revoke: a confirmed live
-- connection is terminally reconciled and its duplicate credential is purged.
SELECT record_orphaned_bank_item(
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid',
    'enc_reconcile_live',
    'FINALIZE_OUTCOME_UNKNOWN',
    'pending_reconciliation',
    '44050000-0000-4000-e000-000000000003'
);
CREATE TEMP TABLE reconcile_claim AS
SELECT *
FROM claim_bank_revocation_jobs(
    '44050000-0000-4000-8400-000000000004',
    100,
    120
)
WHERE connection_id = '44050000-0000-4000-e000-000000000003';

CREATE TEMP TABLE reconciliation_result AS
SELECT resolve_bank_revocation_reconciliation(
    (SELECT id FROM reconcile_claim),
    '44050000-0000-4000-8400-000000000004'
) AS disposition;

SELECT pg_temp.assert_true(
    (SELECT disposition = 'retained' FROM reconciliation_result)
    AND (
        SELECT status = 'reconciled' AND encrypted_access_token IS NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM reconcile_claim)
    )
    AND (
        SELECT status = 'active'
        FROM bank_connections
        WHERE id = '44050000-0000-4000-e000-000000000003'
    ),
    'finalization ambiguity resolves live without revoking the retained Item'
);

-- ---------------------------------------------------------------------------
-- Idempotent disconnect/account deletion and identity severing
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
    (
        SELECT status = 'enqueued'
        FROM enqueue_bank_connection_revocation(
            '44050000-0000-4000-f000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            'disconnect'
        )
    )
    AND (
        SELECT status = 'enqueued'
        FROM enqueue_bank_connection_revocation(
            '44050000-0000-4000-f000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            'disconnect'
        )
    )
    AND (
        SELECT count(*) = 1
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-f000-000000000001'
          AND status IN ('pending_revocation', 'pending_reconciliation', 'exhausted')
    ),
    'duplicate disconnect delivery reuses one durable outbox job'
);

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status
) VALUES (
    '44050000-0000-4000-d000-000000000001',
    '44050000-0000-4000-9000-000000000003',
    '44050000-0000-4000-8000-000000000001',
    'plaid', 'erasure-1', 'Erasure One', 'enc_erasure_1', 'active'
);

INSERT INTO bank_connection_orphaned_items (
    household_id, owner_id, provider, encrypted_access_token, status,
    source_reason, revoked_at, last_error_code
) VALUES (
    '44050000-0000-4000-9000-000000000003',
    '44050000-0000-4000-8000-000000000001',
    'plaid', NULL, 'revoked', 'disconnect', now(), 'TEST_TERMINAL_ERASURE'
);

SELECT enqueue_bank_revocations_for_erasure(
    '44050000-0000-4000-8000-000000000001',
    ARRAY['44050000-0000-4000-9000-000000000003']::UUID[]
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE source_reason = 'account_deletion'
          AND encrypted_access_token = 'enc_erasure_1'
          AND household_id IS NULL
          AND owner_id IS NULL
          AND connection_id IS NULL
          AND erasure_requested_at IS NOT NULL
          AND retain_until <= now() + interval '7 days'
    )
    AND EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE last_error_code = 'TEST_TERMINAL_ERASURE'
          AND household_id IS NULL
          AND owner_id IS NULL
          AND connection_id IS NULL
    )
    AND (
        SELECT status = 'revocation_pending'
        FROM bank_connections
        WHERE id = '44050000-0000-4000-d000-000000000001'
    ),
    'account deletion atomically enqueues, disables sync, and severs beneficiary identity'
);

DELETE FROM bank_connections
WHERE id = '44050000-0000-4000-d000-000000000001';

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE source_reason = 'account_deletion'
          AND encrypted_access_token = 'enc_erasure_1'
          AND household_id IS NULL
          AND owner_id IS NULL
          AND connection_id IS NULL
    ),
    'processor erasure work survives deletion without beneficiary foreign keys'
);

-- ---------------------------------------------------------------------------
-- Bounded exhausted retry and terminal credential purge
-- ---------------------------------------------------------------------------
SELECT record_orphaned_bank_item(
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid',
    'enc_exhausted',
    NULL,
    'pending_revocation',
    NULL
);
UPDATE bank_connection_orphaned_items
SET attempts = max_attempts - 1,
    next_attempt_at = now() - interval '1 second'
WHERE encrypted_access_token = 'enc_exhausted';

CREATE TEMP TABLE exhausted_claim AS
SELECT *
FROM claim_bank_revocation_jobs(
    '44050000-0000-4000-8400-000000000005',
    100,
    120
)
WHERE encrypted_access_token = 'enc_exhausted';

SELECT pg_temp.assert_true(
    (
        SELECT status = 'exhausted'
        FROM fail_bank_revocation_job(
            (SELECT id FROM exhausted_claim),
            '44050000-0000-4000-8400-000000000005',
            'PROVIDER_OUTAGE'
        )
    )
    AND (
        SELECT encrypted_access_token = 'enc_exhausted'
           AND retain_until > now()
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM exhausted_claim)
    ),
    'retry exhaustion is operator-visible and retains capability only to its ceiling'
);

UPDATE bank_connection_orphaned_items
SET retain_until = now() - interval '1 second'
WHERE id = (SELECT id FROM exhausted_claim);

SELECT purge_expired_orphaned_bank_items();

SELECT pg_temp.assert_true(
    (
        SELECT status = 'abandoned'
           AND encrypted_access_token IS NULL
           AND household_id = '44050000-0000-4000-9000-000000000001'
           AND owner_id = '44050000-0000-4000-8000-000000000001'
           AND connection_id IS NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM exhausted_claim)
    ),
    'bounded retention purges exhausted credentials while retaining normal audit correlation'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM bank_revocation_reconciliation_status()
        WHERE status IN ('pending_revocation', 'exhausted', 'abandoned')
    ),
    'secret-safe aggregate reconciliation state is visible to operators'
);

ROLLBACK;
