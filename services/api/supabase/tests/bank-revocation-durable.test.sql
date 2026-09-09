-- SPDX-License-Identifier: BUSL-1.1

\set ON_ERROR_STOP on

-- Stage 7 durable downgrade/revocation integration suite (#4405).
-- Synthetic data only. Run against local Supabase after all migrations.

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
-- Least privilege, RLS, pinned search_path, and implementation contracts.
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
    )
    AND (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'bank_connection_erasure_barriers'::regclass
    ),
    'credential outbox and selections must have RLS enabled'
);

SELECT pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'bank_connection_orphaned_items', 'SELECT')
    AND NOT has_table_privilege(
        'authenticated',
        'bank_connection_retention_selections',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'bank_connection_erasure_barriers',
        'SELECT'
    )
    AND NOT has_table_privilege('anon', 'bank_connection_orphaned_items', 'SELECT')
    AND has_table_privilege('service_role', 'bank_connection_orphaned_items', 'SELECT')
    AND has_table_privilege(
        'service_role',
        'bank_connection_retention_selections',
        'SELECT'
    ),
    'only service_role may read the server-only Stage 7 state'
);

SELECT pg_temp.assert_true(
    NOT has_function_privilege(
        'authenticated',
        'prepare_bank_connection_retention_selection(uuid,uuid,bigint,uuid[])',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'enqueue_bank_connection_revocation(uuid,text,uuid,boolean)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'claim_bank_revocation_jobs(integer,interval)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'finalize_or_enqueue_bank_connection(uuid,uuid,uuid,text,text,text,text,jsonb,uuid)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'bank_revocation_reconciliation_summary()',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'dispatch_bank_revocation_worker()',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'transition_bank_connection_sync_state(uuid,text,text,text)',
        'EXECUTE'
    ),
    'no Stage 7 credential or mutation RPC may be client executable'
);

SELECT pg_temp.assert_true(
    (
        SELECT bool_and(
            p.prosecdef
            AND p.proconfig @> ARRAY['search_path=public']
        )
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'prepare_bank_connection_retention_selection',
              'finalize_or_enqueue_bank_connection',
              'enqueue_bank_connection_revocation',
              'apply_bank_connection_allowance_reduction',
              'reconcile_bank_connection_allowances',
              'enqueue_bank_connection_erasure',
              'claim_bank_revocation_jobs',
              'resolve_bank_revocation_reconciliation',
              'retry_bank_revocation_job',
              'complete_bank_revocation_job',
              'requeue_exhausted_bank_revocation_job',
              'bank_revocation_reconciliation_summary',
              'dispatch_bank_revocation_worker',
              'enforce_active_bank_connection_for_aggregator_write',
              'transition_bank_connection_sync_state'
          )
    ),
    'every Stage 7 RPC must be SECURITY DEFINER with a pinned search_path'
);

SELECT pg_temp.assert_true(
    pg_get_functiondef(
        'claim_bank_revocation_jobs(integer,interval)'::regprocedure
    ) LIKE '%FOR UPDATE OF o SKIP LOCKED%',
    'worker claims must use FOR UPDATE SKIP LOCKED'
);

SELECT pg_temp.assert_true(
    pg_get_functiondef('dispatch_bank_revocation_worker()'::regprocedure)
        LIKE '%bank_revocation_worker_url%'
    AND pg_get_functiondef('dispatch_bank_revocation_worker()'::regprocedure)
        LIKE '%bank_revocation_cron_secret%',
    'worker dispatch must resolve only the reviewed Vault secret names'
);

-- ---------------------------------------------------------------------------
-- Synthetic entitlement subject and household fixtures.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
    (
        '44050000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'owner-4405@example.invalid', '',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
        '44050000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin-4405@example.invalid', '',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
        '44050000-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'member-4405@example.invalid', '',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
        '44050000-0000-4000-8000-000000000004',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'outsider-4405@example.invalid', '',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
        '44050000-0000-4000-8000-000000000005',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'delete-4405@example.invalid', '',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    );

INSERT INTO users (id, email, display_name) VALUES
    ('44050000-0000-4000-8000-000000000001', 'owner-public@example.invalid', 'Owner'),
    ('44050000-0000-4000-8000-000000000002', 'admin-public@example.invalid', 'Admin'),
    ('44050000-0000-4000-8000-000000000003', 'member-public@example.invalid', 'Member'),
    ('44050000-0000-4000-8000-000000000004', 'outsider-public@example.invalid', 'Outsider'),
    ('44050000-0000-4000-8000-000000000005', 'delete-public@example.invalid', 'Delete User');

INSERT INTO households (id, name, created_by) VALUES
    ('44050000-0000-4000-9000-000000000001', 'Explicit household', '44050000-0000-4000-8000-000000000001'),
    ('44050000-0000-4000-9000-000000000002', 'Family fallback household', '44050000-0000-4000-8000-000000000001'),
    ('44050000-0000-4000-9000-000000000003', 'Premium fallback household', '44050000-0000-4000-8000-000000000001'),
    ('44050000-0000-4000-9000-000000000004', 'Deletion household', '44050000-0000-4000-8000-000000000005'),
    ('44050000-0000-4000-9000-000000000005', 'Expiry household', '44050000-0000-4000-8000-000000000001');

INSERT INTO household_members (id, household_id, user_id, role) VALUES
    ('44050000-0000-4000-a000-000000000001', '44050000-0000-4000-9000-000000000001', '44050000-0000-4000-8000-000000000001', 'owner'),
    ('44050000-0000-4000-a000-000000000002', '44050000-0000-4000-9000-000000000001', '44050000-0000-4000-8000-000000000002', 'admin'),
    ('44050000-0000-4000-a000-000000000003', '44050000-0000-4000-9000-000000000001', '44050000-0000-4000-8000-000000000003', 'member'),
    ('44050000-0000-4000-a000-000000000004', '44050000-0000-4000-9000-000000000002', '44050000-0000-4000-8000-000000000001', 'owner'),
    ('44050000-0000-4000-a000-000000000005', '44050000-0000-4000-9000-000000000003', '44050000-0000-4000-8000-000000000001', 'owner'),
    ('44050000-0000-4000-a000-000000000006', '44050000-0000-4000-9000-000000000004', '44050000-0000-4000-8000-000000000005', 'owner'),
    ('44050000-0000-4000-a000-000000000007', '44050000-0000-4000-9000-000000000005', '44050000-0000-4000-8000-000000000001', 'owner');

-- Produce one real server-authoritative grant, then reuse its FK as a synthetic
-- source for the additional isolated projection rows.
INSERT INTO billing_accounts (id, owner_id, premium_sponsored_household_id)
VALUES (
    '44050000-0000-4000-b000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    '44050000-0000-4000-9000-000000000001'
);
INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
)
VALUES (
    '44050000-0000-4000-c000-000000000001',
    '44050000-0000-4000-b000-000000000001',
    'stripe', 'sandbox', 'cus_stage7_synthetic', true
);

SELECT pg_temp.assert_true(
    apply_billing_provider_event(record_billing_provider_event(
        '44050000-0000-4000-b000-000000000001',
        '44050000-0000-4000-c000-000000000001',
        'stripe', 'sandbox',
        'evt_stage7_premium', 'sub_stage7_premium', NULL,
        now(), now() - interval '2 days', 10,
        'activated', 'active', 'base_plan', 'premium', 1,
        now() + interval '30 days',
        NULL, NULL, NULL
    )),
    'synthetic Premium event must apply'
);

SELECT refresh_household_entitlement_projection(
    '44050000-0000-4000-9000-000000000001'
);

-- Start explicit/fallback households at Family 4. The source row is a valid
-- server-created grant; only the projection values are varied for this focused
-- downgrade state-machine suite.
UPDATE current_household_entitlements
SET display_tier = 'family',
    is_premium_sponsored = false,
    bank_connection_allowance = 4
WHERE household_id = '44050000-0000-4000-9000-000000000001';

INSERT INTO current_household_entitlements (
    household_id, display_tier, is_premium_sponsored,
    bank_connection_allowance, source_base_grant_id,
    effective_at, expires_at
)
SELECT
    household_id,
    CASE WHEN household_id = '44050000-0000-4000-9000-000000000003'
        THEN 'premium' ELSE 'family' END,
    household_id = '44050000-0000-4000-9000-000000000003',
    CASE WHEN household_id = '44050000-0000-4000-9000-000000000003'
        THEN 2 ELSE 4 END,
    (
        SELECT source_base_grant_id
        FROM current_household_entitlements
        WHERE household_id = '44050000-0000-4000-9000-000000000001'
    ),
    now() - interval '1 day',
    now() + interval '30 days'
FROM (
    VALUES
        ('44050000-0000-4000-9000-000000000002'::UUID),
        ('44050000-0000-4000-9000-000000000003'::UUID),
        ('44050000-0000-4000-9000-000000000004'::UUID),
        ('44050000-0000-4000-9000-000000000005'::UUID)
) h(household_id)
ON CONFLICT (household_id) DO UPDATE
SET display_tier = EXCLUDED.display_tier,
    is_premium_sponsored = EXCLUDED.is_premium_sponsored,
    bank_connection_allowance = EXCLUDED.bank_connection_allowance,
    source_base_grant_id = EXCLUDED.source_base_grant_id,
    effective_at = EXCLUDED.effective_at,
    expires_at = EXCLUDED.expires_at;

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, created_at
)
VALUES
    ('44050000-0000-4000-d000-000000000101', '44050000-0000-4000-9000-000000000001', '44050000-0000-4000-8000-000000000001', 'plaid', 'explicit-1', 'Synthetic 1', 'enc-explicit-1', 'active', now() - interval '4 days'),
    ('44050000-0000-4000-d000-000000000102', '44050000-0000-4000-9000-000000000001', '44050000-0000-4000-8000-000000000001', 'plaid', 'explicit-2', 'Synthetic 2', 'enc-explicit-2', 'active', now() - interval '3 days'),
    ('44050000-0000-4000-d000-000000000103', '44050000-0000-4000-9000-000000000001', '44050000-0000-4000-8000-000000000001', 'plaid', 'explicit-3', 'Synthetic 3', 'enc-explicit-3', 'active', now() - interval '2 days'),
    ('44050000-0000-4000-d000-000000000104', '44050000-0000-4000-9000-000000000001', '44050000-0000-4000-8000-000000000001', 'plaid', 'explicit-4', 'Synthetic 4', 'enc-explicit-4', 'active', now() - interval '1 day'),
    ('44050000-0000-4000-d000-000000000201', '44050000-0000-4000-9000-000000000002', '44050000-0000-4000-8000-000000000001', 'plaid', 'fallback-1', 'Synthetic 1', 'enc-fallback-1', 'active', '2026-09-01T00:00:00Z'),
    ('44050000-0000-4000-d000-000000000202', '44050000-0000-4000-9000-000000000002', '44050000-0000-4000-8000-000000000001', 'plaid', 'fallback-2', 'Synthetic 2', 'enc-fallback-2', 'active', '2026-09-01T00:00:00Z'),
    ('44050000-0000-4000-d000-000000000203', '44050000-0000-4000-9000-000000000002', '44050000-0000-4000-8000-000000000001', 'plaid', 'fallback-3', 'Synthetic 3', 'enc-fallback-3', 'active', '2026-09-02T00:00:00Z'),
    ('44050000-0000-4000-d000-000000000204', '44050000-0000-4000-9000-000000000002', '44050000-0000-4000-8000-000000000001', 'plaid', 'fallback-4', 'Synthetic 4', 'enc-fallback-4', 'active', '2026-09-03T00:00:00Z'),
    ('44050000-0000-4000-d000-000000000301', '44050000-0000-4000-9000-000000000003', '44050000-0000-4000-8000-000000000001', 'plaid', 'free-1', 'Synthetic 1', 'enc-free-1', 'active', now() - interval '2 days'),
    ('44050000-0000-4000-d000-000000000302', '44050000-0000-4000-9000-000000000003', '44050000-0000-4000-8000-000000000001', 'plaid', 'free-2', 'Synthetic 2', 'enc-free-2', 'active', now() - interval '1 day'),
    ('44050000-0000-4000-d000-000000000401', '44050000-0000-4000-9000-000000000004', '44050000-0000-4000-8000-000000000005', 'plaid', 'delete-1', 'Synthetic 1', 'enc-delete-1', 'active', now() - interval '1 day'),
    ('44050000-0000-4000-d000-000000000501', '44050000-0000-4000-9000-000000000005', '44050000-0000-4000-8000-000000000001', 'plaid', 'expiry-1', 'Synthetic 1', 'enc-expiry-1', 'active', now() - interval '4 days'),
    ('44050000-0000-4000-d000-000000000502', '44050000-0000-4000-9000-000000000005', '44050000-0000-4000-8000-000000000001', 'plaid', 'expiry-2', 'Synthetic 2', 'enc-expiry-2', 'active', now() - interval '3 days'),
    ('44050000-0000-4000-d000-000000000503', '44050000-0000-4000-9000-000000000005', '44050000-0000-4000-8000-000000000001', 'plaid', 'expiry-3', 'Synthetic 3', 'enc-expiry-3', 'active', now() - interval '2 days'),
    ('44050000-0000-4000-d000-000000000504', '44050000-0000-4000-9000-000000000005', '44050000-0000-4000-8000-000000000001', 'plaid', 'expiry-4', 'Synthetic 4', 'enc-expiry-4', 'active', now() - interval '1 day');

-- Financial history has no destructive dependency on provider revocation.
INSERT INTO accounts (
    id, household_id, owner_id, name, type, currency_code, balance_cents
)
VALUES (
    '44050000-0000-4000-e000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'Synthetic account', 'checking', 'USD', 12345
);
INSERT INTO transactions (
    id, household_id, owner_id, account_id, amount_cents,
    currency_code, type, date
)
VALUES (
    '44050000-0000-4000-f000-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    '44050000-0000-4000-e000-000000000001',
    -321, 'USD', 'EXPENSE', current_date
);
INSERT INTO bank_connection_accounts (
    id, bank_connection_id, household_id, account_id,
    external_account_id, external_name, is_linked
)
VALUES (
    '44050000-0000-4000-e100-000000000001',
    '44050000-0000-4000-d000-000000000101',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-e000-000000000001',
    'external-synthetic', 'Synthetic account', true
);
SET LOCAL ROLE service_role;
INSERT INTO transactions (
    id, household_id, owner_id, account_id, amount_cents,
    currency_code, type, date, source, import_source_id,
    provider_transaction_id
)
VALUES (
    '44050000-0000-4000-f000-000000000004',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    '44050000-0000-4000-e000-000000000001',
    -444, 'USD', 'expense', current_date, 'aggregator',
    '44050000-0000-4000-d000-000000000101',
    'provider-before-disable'
);
RESET ROLE;
CREATE TEMP TABLE history_before_downgrade AS
SELECT balance_cents
FROM accounts
WHERE id = '44050000-0000-4000-e000-000000000001';

-- ---------------------------------------------------------------------------
-- Selection authorization/rejection and retained safety.
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    prepare_bank_connection_retention_selection(
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000003',
        2,
        ARRAY['44050000-0000-4000-d000-000000000103']::UUID[]
    ) = 'forbidden',
    'ordinary household members cannot select retained provider connections'
);
SELECT pg_temp.assert_true(
    prepare_bank_connection_retention_selection(
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000004',
        2,
        ARRAY['44050000-0000-4000-d000-000000000103']::UUID[]
    ) = 'forbidden',
    'cross-household users cannot select retained provider connections'
);
SELECT pg_temp.assert_true(
    prepare_bank_connection_retention_selection(
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000002',
        2,
        ARRAY['44050000-0000-4000-d000-000000000201']::UUID[]
    ) = 'invalid_selection',
    'selection rejects a live connection belonging to another entitlement subject'
);
SELECT pg_temp.assert_true(
    prepare_bank_connection_retention_selection(
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000002',
        2,
        ARRAY[
            '44050000-0000-4000-d000-000000000103',
            '44050000-0000-4000-d000-000000000103'
        ]::UUID[]
    ) = 'invalid_selection',
    'selection rejects duplicate connection ids'
);
SELECT pg_temp.assert_true(
    prepare_bank_connection_retention_selection(
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000002',
        4,
        ARRAY[]::UUID[]
    ) = 'invalid_target',
    'selection target must be a server-observed allowance reduction'
);
SELECT pg_temp.assert_true(
    prepare_bank_connection_retention_selection(
        '44050000-0000-4000-9000-000000000001',
        '44050000-0000-4000-8000-000000000002',
        2,
        ARRAY[
            '44050000-0000-4000-d000-000000000103',
            '44050000-0000-4000-d000-000000000104'
        ]::UUID[]
    ) = 'accepted',
    'authorized admin can select two current live connections'
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
            '44050000-0000-4000-d000-000000000103',
            '44050000-0000-4000-d000-000000000104'
        )
          AND status = 'active'
          AND encrypted_access_token IS NOT NULL
          AND sync_disabled_at IS NULL
    ),
    'explicitly retained connections are never revoked or disabled'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE id IN (
            '44050000-0000-4000-d000-000000000101',
            '44050000-0000-4000-d000-000000000102'
        )
          AND status = 'revocation_pending'
          AND encrypted_access_token IS NULL
          AND sync_disabled_at IS NOT NULL
          AND deleted_at IS NULL
    ),
    'excess connections stop synchronization immediately without early deletion'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connection_orphaned_items
        WHERE connection_id IN (
            '44050000-0000-4000-d000-000000000101',
            '44050000-0000-4000-d000-000000000102'
        )
          AND operation_reason = 'downgrade'
          AND status = 'pending_revocation'
          AND encrypted_access_token IS NOT NULL
    ),
    'downgrade moves each encrypted retry credential into the unified outbox'
);
SELECT pg_temp.assert_true(
    (
        SELECT a.balance_cents = before.balance_cents
        FROM accounts a
        CROSS JOIN history_before_downgrade before
        WHERE a.id = '44050000-0000-4000-e000-000000000001'
    )
    AND (SELECT amount_cents = -321 FROM transactions WHERE id = '44050000-0000-4000-f000-000000000001')
    AND EXISTS (
        SELECT 1 FROM bank_connection_accounts
        WHERE id = '44050000-0000-4000-e100-000000000001'
    ),
    'account balance, transactions, and historical connection mapping are preserved'
);

SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error(
    $sql$
        INSERT INTO transactions (
            id, household_id, owner_id, account_id, amount_cents,
            currency_code, type, date, source, import_source_id,
            provider_transaction_id
        )
        VALUES (
            '44050000-0000-4000-f000-000000000002',
            '44050000-0000-4000-9000-000000000001',
            '44050000-0000-4000-8000-000000000001',
            '44050000-0000-4000-e000-000000000001',
            -111, 'USD', 'EXPENSE', current_date, 'aggregator',
            '44050000-0000-4000-d000-000000000101',
            'provider-after-disable'
        )
    $sql$,
    '23514',
    'an in-flight aggregator write cannot commit after sync is disabled'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44050000-0000-4000-8000-000000000001',
    true
);
SELECT pg_temp.expect_error(
    $sql$
        UPDATE transactions
        SET source = 'manual',
            import_source_id = NULL,
            provider_transaction_id = NULL
        WHERE id = '44050000-0000-4000-f000-000000000004'
    $sql$,
    '42501',
    'authenticated users cannot rewrite server-issued aggregator provenance'
);
UPDATE transactions
SET note = 'User-maintained historical note'
WHERE id = '44050000-0000-4000-f000-000000000004';
RESET ROLE;
SELECT pg_temp.assert_true(
    (
        SELECT note = 'User-maintained historical note'
        FROM transactions
        WHERE id = '44050000-0000-4000-f000-000000000004'
    ),
    'users can still edit ordinary fields on imported history after disconnect'
);

INSERT INTO transactions (
    id, household_id, owner_id, account_id, amount_cents,
    currency_code, type, date, source
)
VALUES (
    '44050000-0000-4000-f000-000000000003',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    '44050000-0000-4000-e000-000000000001',
    -222, 'USD', 'EXPENSE', current_date, 'manual'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM transactions
        WHERE id = '44050000-0000-4000-f000-000000000003'
    ),
    'manual entry remains available after provider sync is disabled'
);

-- ---------------------------------------------------------------------------
-- Deterministic fallback: Family -> Premium and Premium -> Free/Plus.
-- ---------------------------------------------------------------------------

UPDATE current_household_entitlements
SET display_tier = 'premium',
    is_premium_sponsored = true,
    bank_connection_allowance = 2
WHERE household_id = '44050000-0000-4000-9000-000000000002';

SELECT pg_temp.assert_true(
    (
        SELECT array_agg(id ORDER BY id) = ARRAY[
            '44050000-0000-4000-d000-000000000201'::UUID,
            '44050000-0000-4000-d000-000000000202'::UUID
        ]
        FROM bank_connections
        WHERE household_id = '44050000-0000-4000-9000-000000000002'
          AND status = 'active'
    ),
    'Family to Premium fallback retains oldest two with id tie-break'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE household_id = '44050000-0000-4000-9000-000000000002'
          AND status = 'revocation_pending'
    ),
    'Family to Premium queues every newer excess connection'
);

UPDATE current_household_entitlements
SET display_tier = 'free',
    is_premium_sponsored = false,
    bank_connection_allowance = 0,
    source_base_grant_id = NULL,
    expires_at = NULL
WHERE household_id = '44050000-0000-4000-9000-000000000003';

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE household_id = '44050000-0000-4000-9000-000000000003'
          AND status = 'revocation_pending'
          AND encrypted_access_token IS NULL
    ),
    'Premium to Free/Plus fallback revokes all live connections'
);

SELECT *
FROM apply_bank_connection_allowance_reduction(
    '44050000-0000-4000-9000-000000000002',
    0,
    2,
    (
        SELECT projection_version
        FROM current_household_entitlements
        WHERE household_id = '44050000-0000-4000-9000-000000000002'
    )
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM bank_connections
        WHERE household_id = '44050000-0000-4000-9000-000000000002'
          AND status = 'active'
    ),
    'reduction rechecks the live cap under lock and ignores a stale lower allowance'
);

-- Expiry can reduce authority without updating allowance. Maintenance uses the
-- expiry-aware cap and must queue every now-excess Item.
UPDATE current_household_entitlements
SET expires_at = now() - interval '1 second'
WHERE household_id = '44050000-0000-4000-9000-000000000005';

SELECT reconcile_bank_connection_allowances();
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 4
        FROM bank_connections
        WHERE household_id = '44050000-0000-4000-9000-000000000005'
          AND status = 'revocation_pending'
    ),
    'clock-driven expiry is reconciled even without a projection update event'
);

-- ---------------------------------------------------------------------------
-- Disconnect idempotency and atomic enqueue-before-disable.
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT result_status = 'enqueued' AND outbox_id IS NOT NULL
        FROM enqueue_bank_connection_revocation(
            '44050000-0000-4000-d000-000000000103',
            'user_disconnect',
            '44050000-0000-4000-8000-000000000002',
            false
        )
    ),
    'authorized disconnect enqueues durably'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000103'
    )
    AND (
        SELECT status = 'revocation_pending'
           AND encrypted_access_token IS NULL
           AND deleted_at IS NULL
        FROM bank_connections
        WHERE id = '44050000-0000-4000-d000-000000000103'
    ),
    'enqueue and sync disable commit together before provider deletion'
);
SELECT enqueue_bank_connection_revocation(
    '44050000-0000-4000-d000-000000000103',
    'user_disconnect',
    '44050000-0000-4000-8000-000000000002',
    false
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000103'
    ),
    'disconnect replay cannot duplicate durable work'
);

CREATE TEMP TABLE atomic_rejection_result AS
SELECT *
FROM finalize_or_enqueue_bank_connection(
    '44050000-0000-4000-d100-000000000001',
    '44050000-0000-4000-9000-000000000001',
    '44050000-0000-4000-8000-000000000001',
    'plaid',
    'atomic-rejection',
    'Synthetic rejection',
    'enc-atomic-rejection',
    '{}'::JSONB,
    '44050000-0000-4000-d000-000000000601'
);
SELECT pg_temp.assert_true(
    (SELECT status = 'reservation_not_found' FROM atomic_rejection_result),
    'definite finalization rejection returns its reason'
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'pending_revocation'
           AND encrypted_access_token = 'enc-atomic-rejection'
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000601'
    ),
    'definite finalization rejection atomically persists the retry credential'
);
SELECT pg_temp.assert_true(
    (
        SELECT result_status = 'forbidden'
        FROM enqueue_bank_connection_revocation(
            '44050000-0000-4000-d000-000000000104',
            'user_disconnect',
            '44050000-0000-4000-8000-000000000004',
            false
        )
    )
    AND (
        SELECT status = 'active' AND encrypted_access_token IS NOT NULL
        FROM bank_connections
        WHERE id = '44050000-0000-4000-d000-000000000104'
    ),
    'unauthorized disconnect cannot mutate another entitlement subject'
);

-- ---------------------------------------------------------------------------
-- Worker claim/retry/completion/replay and reconciliation safety.
-- ---------------------------------------------------------------------------

UPDATE bank_connection_orphaned_items
SET available_at = now() + interval '1 hour'
WHERE status IN ('pending_revocation', 'pending_reconciliation', 'retry_wait');
UPDATE bank_connection_orphaned_items
SET available_at = now() - interval '1 second'
WHERE connection_id = '44050000-0000-4000-d000-000000000103';

CREATE TEMP TABLE claimed_stage7 AS
SELECT * FROM claim_bank_revocation_jobs(1, interval '5 minutes');

SELECT pg_temp.assert_true(
    (SELECT count(*) = 1 FROM claimed_stage7)
    AND (
        SELECT count(*) = 1
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_stage7)
          AND status = 'processing'
          AND encrypted_access_token IS NOT NULL
    ),
    'worker atomically leases one credential-bearing job'
);

CREATE TEMP TABLE retry_stage7 AS
SELECT *
FROM retry_bank_revocation_job(
    (SELECT id FROM claimed_stage7),
    (SELECT claim_token FROM claimed_stage7),
    'PROVIDER_OUTAGE'
);

SELECT pg_temp.assert_true(
    (
        SELECT result_status = 'retry_wait'
           AND next_attempt_at > now() + interval '22 seconds'
           AND next_attempt_at < now() + interval '38 seconds'
        FROM retry_stage7
    )
    AND (
        SELECT encrypted_access_token IS NOT NULL
           AND last_error_code = 'PROVIDER_OUTAGE'
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM claimed_stage7)
    ),
    'failure retains the credential and applies bounded exponential backoff with jitter'
);

UPDATE bank_connection_orphaned_items
SET available_at = now() - interval '1 second'
WHERE id = (SELECT id FROM claimed_stage7);

CREATE TEMP TABLE reclaimed_stage7 AS
SELECT * FROM claim_bank_revocation_jobs(1, interval '5 minutes');

SELECT pg_temp.assert_true(
    complete_bank_revocation_job(
        (SELECT id FROM reclaimed_stage7),
        (SELECT claim_token FROM reclaimed_stage7),
        'already_invalid'
    ),
    'already-invalid is terminal success'
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'revoked'
           AND encrypted_access_token IS NULL
           AND last_error_code = 'ALREADY_INVALID'
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM reclaimed_stage7)
    )
    AND (
        SELECT status = 'disconnected'
           AND deleted_at IS NOT NULL
           AND encrypted_access_token IS NULL
        FROM bank_connections
        WHERE id = (SELECT connection_id FROM reclaimed_stage7)
    ),
    'terminal success purges the credential and only then soft-deletes the connection'
);
SELECT pg_temp.assert_true(
    NOT complete_bank_revocation_job(
        (SELECT id FROM reclaimed_stage7),
        (SELECT claim_token FROM reclaimed_stage7),
        'already_invalid'
    ),
    'terminal completion replay is a no-op'
);

-- A Stage 6 unknown outcome that actually committed is reconciled without any
-- provider-side destructive action.
SELECT record_orphaned_bank_item(
    '44050000-0000-4000-9000-000000000002',
    '44050000-0000-4000-8000-000000000001',
    'plaid',
    'enc-reconcile-committed',
    'FINALIZE_OUTCOME_UNKNOWN',
    'pending_reconciliation',
    '44050000-0000-4000-d000-000000000201'
);
UPDATE bank_connection_orphaned_items
SET available_at = now() - interval '1 second'
WHERE connection_id = '44050000-0000-4000-d000-000000000201';

CREATE TEMP TABLE reconcile_claim AS
SELECT * FROM claim_bank_revocation_jobs(1, interval '5 minutes');

SELECT pg_temp.assert_true(
    (SELECT connection_id = '44050000-0000-4000-d000-000000000201' FROM reconcile_claim)
    AND
    resolve_bank_revocation_reconciliation(
        (SELECT id FROM reconcile_claim),
        (SELECT claim_token FROM reconcile_claim)
    ) = 'reconciled',
    'committed finalization is reconciled without revoking its retained Item'
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'active' AND encrypted_access_token IS NOT NULL
        FROM bank_connections
        WHERE id = '44050000-0000-4000-d000-000000000201'
    )
    AND (
        SELECT status = 'reconciled' AND encrypted_access_token IS NULL
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000201'
    ),
    'reconciliation purges only the duplicate outbox envelope'
);

SELECT pg_temp.assert_true(
    (
        SELECT result_status = 'enqueued'
        FROM enqueue_bank_connection_revocation(
            '44050000-0000-4000-d000-000000000201',
            'user_disconnect',
            '44050000-0000-4000-8000-000000000001',
            false
        )
    )
    AND (
        SELECT count(*) = 1
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000201'
          AND status = 'pending_revocation'
    ),
    'a reconciled finalization releases its key for a later legitimate disconnect'
);

INSERT INTO bank_connection_orphaned_items (
    id, provider, encrypted_access_token, status, attempts, max_attempts,
    operation_reason, idempotency_key, available_at, retain_until
)
VALUES (
    '44050000-0000-4000-d200-000000000001',
    'plaid',
    'enc-completion-recovery',
    'pending_revocation',
    7,
    8,
    'finalization_rejected',
    'completion-recovery:4405',
    now() - interval '1 second',
    now() + interval '1 day'
);
UPDATE bank_connection_orphaned_items
SET available_at = now() + interval '1 hour'
WHERE status IN ('pending_revocation', 'pending_reconciliation', 'retry_wait')
  AND id <> '44050000-0000-4000-d200-000000000001';
CREATE TEMP TABLE final_attempt_claim AS
SELECT * FROM claim_bank_revocation_jobs(1, interval '30 seconds');
UPDATE bank_connection_orphaned_items
SET claim_expires_at = now() - interval '1 second'
WHERE id = '44050000-0000-4000-d200-000000000001';
CREATE TEMP TABLE completion_recovery_claim AS
SELECT * FROM claim_bank_revocation_jobs(1, interval '30 seconds');
SELECT pg_temp.assert_true(
    (
        SELECT id = '44050000-0000-4000-d200-000000000001'
           AND attempt_number = 8
        FROM completion_recovery_claim
    )
    AND (
        SELECT completion_recovery_attempts = 1
        FROM bank_connection_orphaned_items
        WHERE id = '44050000-0000-4000-d200-000000000001'
    ),
    'a lost completion on the final provider attempt receives a bounded recovery claim'
);
SELECT pg_temp.assert_true(
    complete_bank_revocation_job(
        (SELECT id FROM completion_recovery_claim),
        (SELECT claim_token FROM completion_recovery_claim),
        'already_invalid'
    ),
    'completion recovery can finish through the provider already-invalid result'
);

UPDATE bank_connection_orphaned_items
SET status = 'exhausted',
    exhausted_at = now(),
    retain_until = now() - interval '1 second'
WHERE connection_id = '44050000-0000-4000-d000-000000000101';
SELECT purge_expired_orphaned_bank_items();
SELECT pg_temp.assert_true(
    (
        SELECT status = 'abandoned'
           AND encrypted_access_token IS NULL
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000101'
    )
    AND (
        SELECT status = 'disconnected'
           AND deleted_at IS NOT NULL
           AND encrypted_access_token IS NULL
        FROM bank_connections
        WHERE id = '44050000-0000-4000-d000-000000000101'
    )
    AND (
        SELECT result_status = 'not_found'
        FROM enqueue_bank_connection_revocation(
            '44050000-0000-4000-d000-000000000101',
            'user_disconnect',
            '44050000-0000-4000-8000-000000000001',
            false
        )
    ),
    'retention exhaustion terminalizes the local connection without losing history'
);

-- Sequential claims are disjoint; the function definition assertion above
-- proves concurrent sessions skip rows already locked by another claimant.
UPDATE bank_connection_orphaned_items
SET available_at = now() - interval '1 second'
WHERE status IN ('pending_revocation', 'pending_reconciliation', 'retry_wait');

CREATE TEMP TABLE disjoint_claim_one AS
SELECT * FROM claim_bank_revocation_jobs(1, interval '5 minutes');
CREATE TEMP TABLE disjoint_claim_two AS
SELECT * FROM claim_bank_revocation_jobs(1, interval '5 minutes');
SELECT pg_temp.assert_true(
    (SELECT id FROM disjoint_claim_one) IS DISTINCT FROM
        (SELECT id FROM disjoint_claim_two),
    'independent worker claims never receive the same job'
);

-- Exhaustion retains the credential for operator reconciliation, then the hard
-- retention ceiling destroys it and leaves only a secret-safe disposition.
UPDATE bank_connection_orphaned_items
SET max_attempts = attempts
WHERE id = (SELECT id FROM disjoint_claim_one);
SELECT retry_bank_revocation_job(
    (SELECT id FROM disjoint_claim_one),
    (SELECT claim_token FROM disjoint_claim_one),
    'TRANSPORT_FAILURE'
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'exhausted'
           AND exhausted_at IS NOT NULL
           AND encrypted_access_token IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM disjoint_claim_one)
    )
    AND (
        bank_revocation_reconciliation_summary() ->> 'exhausted'
    )::BIGINT >= 1,
    'exhausted work remains encrypted, bounded, and operator-visible by count'
);
SELECT pg_temp.assert_true(
    requeue_exhausted_bank_revocation_job(
        (SELECT id FROM disjoint_claim_one),
        2
    ),
    'operator reconciliation can safely requeue an unexpired exhausted job'
);
UPDATE bank_connection_orphaned_items
SET status = 'exhausted',
    exhausted_at = now(),
    retain_until = now() - interval '1 second'
WHERE id = (SELECT id FROM disjoint_claim_one);
SELECT purge_expired_orphaned_bank_items();
SELECT pg_temp.assert_true(
    (
        SELECT status = 'abandoned'
           AND encrypted_access_token IS NULL
           AND revoked_at IS NOT NULL
        FROM bank_connection_orphaned_items
        WHERE id = (SELECT id FROM disjoint_claim_one)
    ),
    'bounded exhausted retention purges the credential at its hard ceiling'
);

-- ---------------------------------------------------------------------------
-- Account deletion severs identity while processor erasure remains retryable.
-- ---------------------------------------------------------------------------

SELECT record_orphaned_bank_item(
    '44050000-0000-4000-9000-000000000004',
    '44050000-0000-4000-8000-000000000005',
    'plaid',
    'enc-delete-orphan',
    'FINALIZE_OUTCOME_UNKNOWN',
    'pending_reconciliation',
    '44050000-0000-4000-d000-000000000499'
);

SELECT pg_temp.assert_true(
    enqueue_bank_connection_erasure(
        '44050000-0000-4000-8000-000000000005',
        ARRAY['44050000-0000-4000-9000-000000000004']::UUID[]
    ) = 1,
    'account deletion durably enqueues every live connection before row deletion'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM bank_connection_erasure_barriers
        WHERE owner_fingerprint = bank_connection_owner_fingerprint(
            '44050000-0000-4000-8000-000000000005'
        )
          AND expires_at > now()
    ),
    'account deletion establishes a durable owner barrier before erasure'
);
SELECT pg_temp.expect_error(
    $sql$
        INSERT INTO bank_connection_reservations (
            household_id, owner_id, provider, expires_at
        )
        VALUES (
            '44050000-0000-4000-9000-000000000004',
            '44050000-0000-4000-8000-000000000005',
            'plaid',
            now() + interval '15 minutes'
        )
    $sql$,
    '23514',
    'a deleting owner cannot reserve another provider Item'
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'account_deleting'
        FROM finalize_or_enqueue_bank_connection(
            gen_random_uuid(),
            '44050000-0000-4000-9000-000000000004',
            '44050000-0000-4000-8000-000000000005',
            'plaid',
            'delete-race',
            'Synthetic race',
            'enc-delete-race',
            '{}'::JSONB,
            '44050000-0000-4000-d000-000000000498'
        )
    )
    AND EXISTS (
        SELECT 1
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000498'
          AND operation_reason = 'account_deletion'
          AND encrypted_access_token = 'enc-delete-race'
    ),
    'an in-flight finalization is handed off instead of committing during deletion'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 3
        FROM bank_connection_orphaned_items
        WHERE operation_reason = 'account_deletion'
          AND owner_id = '44050000-0000-4000-8000-000000000005'
          AND retain_until <= now() + interval '7 days'
          AND encrypted_access_token IS NOT NULL
          AND reconciliation_required = false
    ),
    'live and Stage 6 orphan paths share one retryable erasure outbox'
);

DELETE FROM bank_connections
WHERE household_id = '44050000-0000-4000-9000-000000000004';
DELETE FROM household_members
WHERE household_id = '44050000-0000-4000-9000-000000000004';
DELETE FROM current_household_entitlements
WHERE household_id = '44050000-0000-4000-9000-000000000004';
DELETE FROM households
WHERE id = '44050000-0000-4000-9000-000000000004';
DELETE FROM users WHERE id = '44050000-0000-4000-8000-000000000005';
DELETE FROM auth.users WHERE id = '44050000-0000-4000-8000-000000000005';

SELECT pg_temp.assert_true(
    (
        SELECT status = 'account_deleting'
        FROM finalize_or_enqueue_bank_connection(
            gen_random_uuid(),
            '44050000-0000-4000-9000-000000000004',
            '44050000-0000-4000-8000-000000000005',
            'plaid',
            'delete-race-after-auth',
            'Synthetic post-delete race',
            'enc-delete-race-after-auth',
            '{}'::JSONB,
            '44050000-0000-4000-d000-000000000497'
        )
    )
    AND (
        SELECT owner_id IS NULL
           AND household_id IS NULL
           AND encrypted_access_token = 'enc-delete-race-after-auth'
        FROM bank_connection_orphaned_items
        WHERE connection_id = '44050000-0000-4000-d000-000000000497'
    ),
    'an exchange resuming after identity deletion still creates an anonymous durable handoff'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 4
        FROM bank_connection_orphaned_items
        WHERE operation_reason = 'account_deletion'
          AND owner_id IS NULL
          AND household_id IS NULL
          AND encrypted_access_token IS NOT NULL
          AND status IN ('pending_revocation', 'retry_wait', 'processing', 'exhausted')
    ),
    'identity is severed while processor erasure remains retryable and bounded'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM bank_connection_erasure_barriers
        WHERE owner_fingerprint = bank_connection_owner_fingerprint(
            '44050000-0000-4000-8000-000000000005'
        )
    )
    AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'bank_connection_erasure_barriers'
          AND column_name = 'owner_id'
    ),
    'post-deletion barrier retains no identity FK or raw user identifier'
);
UPDATE bank_connection_erasure_barriers
SET expires_at = now() - interval '1 second'
WHERE owner_fingerprint = bank_connection_owner_fingerprint(
    '44050000-0000-4000-8000-000000000005'
);

-- RLS has no client policy, and table privileges above deny even a valid JWT.
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'bank_connection_orphaned_items',
              'bank_connection_retention_selections',
              'bank_connection_erasure_barriers'
          )
          AND roles && ARRAY['authenticated']::name[]
    ),
    'RLS defines no authenticated policy for outbox or retained selections'
);

-- Maintenance carries counts only for secret-safe alerting and retains the
-- Stage 6 orphan retention fields.
SELECT pg_temp.assert_true(
    (
        WITH maintenance AS (SELECT run_all_maintenance() AS result)
        SELECT result ? 'bank_revocations_exhausted'
           AND result ? 'bank_orphans_abandoned'
           AND result ->> 'bank_revocation_dispatch' IN (
               'queued',
               'failed',
               'unavailable'
           )
        FROM maintenance
    ),
    'maintenance exposes only count-based Stage 7 alert and reconciliation signals'
);
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM bank_connection_erasure_barriers
        WHERE owner_fingerprint = bank_connection_owner_fingerprint(
            '44050000-0000-4000-8000-000000000005'
        )
    ),
    'expired deletion barriers are purged by scheduled maintenance'
);

ROLLBACK;

\echo 'bank-revocation-durable.test.sql: all assertions passed'
