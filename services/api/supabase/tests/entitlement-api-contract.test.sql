-- SPDX-License-Identifier: BUSL-1.1

\set ON_ERROR_STOP on

-- Minimized entitlement API contract integration test (#4403).
--
-- The `entitlements-v1` Edge Function is backed *solely* by
-- `public.get_my_entitlements`. This suite pins the parts of that RPC the
-- endpoint depends on: its exact minimized return contract, its least-
-- privilege grants, its fail-closed behavior for unauthenticated and
-- cross-household reads, its scope resolution, and the tier it projects for
-- every ratified lifecycle.
--
-- Run only against local Supabase:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/entitlement-api-contract.test.sql
--
-- The suite runs in one transaction and rolls back every fixture. It must
-- never be pointed at staging or production.

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

-- ---------------------------------------------------------------------------
-- The minimized return contract the endpoint parses
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT p.proargnames
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'get_my_entitlements'
    ) = ARRAY[
        'p_household_id',
        'user_display_tier',
        'household_display_tier',
        'bank_connection_allowance',
        'is_premium_sponsor',
        'is_family_bound',
        'effective_at',
        'expires_at',
        'projection_version',
        'server_time'
    ],
    'the minimized API must expose exactly the ratified projection columns'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL unnest(COALESCE(p.proargnames, ARRAY[]::TEXT[])) AS arg(name)
        WHERE n.nspname = 'public'
          AND p.proname = 'get_my_entitlements'
          AND (
              arg.name ILIKE '%provider%'
              OR arg.name ILIKE '%customer%'
              OR arg.name ILIKE '%product%'
              OR arg.name ILIKE '%subscription%'
              OR arg.name ILIKE '%transaction%'
              OR arg.name ILIKE '%receipt%'
              OR arg.name ILIKE '%purchase%'
              OR arg.name ILIKE '%price%'
              OR arg.name ILIKE '%amount%'
              OR arg.name ILIKE '%secret%'
              OR arg.name ILIKE '%token%'
              OR arg.name ILIKE '%grant_id%'
              OR arg.name ILIKE '%account_id%'
          )
    ),
    'the minimized API must not name provider, purchase, or ledger identifiers'
);

-- ---------------------------------------------------------------------------
-- Least-privilege execution
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.get_my_entitlements(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_my_entitlements(uuid)', 'EXECUTE'),
    'only an authenticated principal may read the minimized projection'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
        WHERE n.nspname = 'public'
          AND p.proname = 'get_my_entitlements'
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ),
    'PUBLIC must never hold EXECUTE on the minimized projection'
);

-- ---------------------------------------------------------------------------
-- Lifecycle coverage: every ratified lifecycle projects a defined tier
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_cases TEXT[] := ARRAY[
        ['trialing', 'trial_started', 'premium'],
        ['active', 'activated', 'premium'],
        ['cancelled_paid_through', 'cancelled', 'premium'],
        ['past_due_grace', 'past_due', 'premium'],
        ['paused_paid_through', 'paused', 'premium'],
        ['expired', 'expired', 'free'],
        ['refunded', 'refunded', 'free'],
        ['chargeback', 'chargeback', 'free']
    ];
    v_case TEXT[];
    v_index INT := 0;
    v_user UUID;
    v_account UUID;
    v_identity UUID;
    v_event UUID;
    v_tier TEXT;
    v_expires TIMESTAMPTZ;
    v_server TIMESTAMPTZ;
    v_household TEXT;
    v_allowance BIGINT;
BEGIN
    FOREACH v_case SLICE 1 IN ARRAY v_cases LOOP
        v_index := v_index + 1;
        v_user := ('44030000-0000-4000-8000-0000000000' || lpad(v_index::TEXT, 2, '0'))::UUID;
        v_account := ('44030000-0000-4000-b000-0000000000' || lpad(v_index::TEXT, 2, '0'))::UUID;
        v_identity := ('44030000-0000-4000-c000-0000000000' || lpad(v_index::TEXT, 2, '0'))::UUID;

        INSERT INTO users (id, email, display_name)
        VALUES (v_user, 'e4403-u' || v_index || '@example.invalid', 'E4403 U' || v_index);

        INSERT INTO billing_accounts (id, owner_id) VALUES (v_account, v_user);

        INSERT INTO billing_provider_identities (
            id,
            billing_account_id,
            provider,
            environment,
            provider_customer_id,
            is_primary
        )
        VALUES (v_identity, v_account, 'stripe', 'sandbox', 'cus_4403_' || v_index, true);

        v_event := public.record_billing_provider_event(
            v_account,
            v_identity,
            'stripe',
            'sandbox',
            'evt_4403_' || v_index,
            'sub_4403_' || v_index,
            NULL,
            now(),
            now() - interval '1 hour',
            1,
            v_case[2],
            v_case[1],
            'base_plan',
            'premium',
            1,
            CASE
                WHEN v_case[1] IN (
                    'trialing',
                    'active',
                    'cancelled_paid_through',
                    'paused_paid_through'
                )
                THEN now() + interval '30 days'
            END,
            CASE WHEN v_case[1] = 'past_due_grace' THEN now() + interval '7 days' END,
            CASE
                WHEN v_case[1] IN ('expired', 'refunded', 'chargeback')
                THEN now() - interval '1 day'
            END,
            NULL,
            false
        );
        PERFORM public.apply_billing_provider_event(v_event);

        -- Read exactly the way the endpoint does: as the authenticated
        -- principal, through the minimized RPC.
        PERFORM set_config('request.jwt.claim.sub', v_user::TEXT, true);
        SELECT
            user_display_tier,
            household_display_tier,
            bank_connection_allowance,
            expires_at,
            server_time
        INTO v_tier, v_household, v_allowance, v_expires, v_server
        FROM public.get_my_entitlements(NULL);
        PERFORM set_config('request.jwt.claim.sub', '', true);

        IF v_tier IS DISTINCT FROM v_case[3] THEN
            RAISE EXCEPTION
                'lifecycle % must project tier %, got %', v_case[1], v_case[3], v_tier;
        END IF;
        IF v_household IS NOT NULL OR v_allowance <> 0 THEN
            RAISE EXCEPTION
                'an unscoped read must carry no household state (lifecycle %)', v_case[1];
        END IF;
        IF v_case[3] = 'free' THEN
            IF v_expires IS NOT NULL THEN
                RAISE EXCEPTION
                    'a revoked lifecycle (%) must carry no validity bound', v_case[1];
            END IF;
        ELSE
            IF v_expires IS NULL OR v_expires <= v_server THEN
                RAISE EXCEPTION
                    'an access-bearing lifecycle (%) must expire after server time', v_case[1];
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Scope resolution, catalog allowances, and cross-tenant denial
-- ---------------------------------------------------------------------------

INSERT INTO users (id, email, display_name) VALUES
    ('44030000-0000-4000-8000-000000000021', 'e4403-member@example.invalid', 'E4403 Member'),
    ('44030000-0000-4000-8000-000000000022', 'e4403-family@example.invalid', 'E4403 Family'),
    ('44030000-0000-4000-8000-000000000023', 'e4403-relative@example.invalid', 'E4403 Relative'),
    ('44030000-0000-4000-8000-000000000024', 'e4403-outsider@example.invalid', 'E4403 Outsider');

INSERT INTO households (id, name, created_by) VALUES
    (
        '44030000-0000-4000-9000-000000000001',
        'E4403 Sponsored Household',
        '44030000-0000-4000-8000-000000000002'
    ),
    (
        '44030000-0000-4000-9000-000000000002',
        'E4403 Family Household',
        '44030000-0000-4000-8000-000000000022'
    );

INSERT INTO household_members (id, household_id, user_id, role) VALUES
    (
        '44030000-0000-4000-a000-000000000001',
        '44030000-0000-4000-9000-000000000001',
        '44030000-0000-4000-8000-000000000002',
        'owner'
    ),
    (
        '44030000-0000-4000-a000-000000000002',
        '44030000-0000-4000-9000-000000000001',
        '44030000-0000-4000-8000-000000000021',
        'member'
    ),
    (
        '44030000-0000-4000-a000-000000000003',
        '44030000-0000-4000-9000-000000000002',
        '44030000-0000-4000-8000-000000000022',
        'owner'
    ),
    (
        '44030000-0000-4000-a000-000000000004',
        '44030000-0000-4000-9000-000000000002',
        '44030000-0000-4000-8000-000000000023',
        'member'
    );

-- The Premium purchaser (the `active` lifecycle fixture) sponsors one
-- household and buys two verified bank add-ons for it.
SELECT set_config('request.jwt.claim.sub', '44030000-0000-4000-8000-000000000002', true);
SELECT public.set_my_premium_household_sponsorship('44030000-0000-4000-9000-000000000001');
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT public.apply_billing_provider_event(
    public.record_billing_provider_event(
        '44030000-0000-4000-b000-000000000002',
        '44030000-0000-4000-c000-000000000002',
        'stripe',
        'sandbox',
        'evt_4403_addon',
        'sub_4403_2',
        'si_4403_addon',
        now(),
        now() - interval '30 minutes',
        2,
        'activated',
        'active',
        'premium_bank_addon',
        NULL,
        2,
        now() + interval '30 days',
        NULL,
        NULL,
        NULL,
        false
    )
);

-- A Family purchase bound to its own household.
INSERT INTO billing_accounts (id, owner_id)
VALUES ('44030000-0000-4000-b000-000000000022', '44030000-0000-4000-8000-000000000022');

INSERT INTO billing_provider_identities (
    id,
    billing_account_id,
    provider,
    environment,
    provider_customer_id,
    is_primary
)
VALUES (
    '44030000-0000-4000-c000-000000000022',
    '44030000-0000-4000-b000-000000000022',
    'stripe',
    'sandbox',
    'cus_4403_family',
    true
);

SELECT public.apply_billing_provider_event(
    public.record_billing_provider_event(
        '44030000-0000-4000-b000-000000000022',
        '44030000-0000-4000-c000-000000000022',
        'stripe',
        'sandbox',
        'evt_4403_family',
        'sub_4403_family',
        NULL,
        now(),
        now() - interval '1 hour',
        1,
        'activated',
        'active',
        'base_plan',
        'family',
        1,
        now() + interval '30 days',
        NULL,
        NULL,
        '44030000-0000-4000-9000-000000000002',
        false
    )
);

-- The sponsor sees Premium at both subjects, so the endpoint reports the user
-- subject; the household carries the catalog base of two plus two add-ons.
SELECT set_config('request.jwt.claim.sub', '44030000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_true(
    (
        SELECT user_display_tier = 'premium'
           AND household_display_tier = 'premium'
           AND bank_connection_allowance = 4
           AND is_premium_sponsor
           AND NOT is_family_bound
           AND expires_at > server_time
        FROM public.get_my_entitlements('44030000-0000-4000-9000-000000000001')
    ),
    'a Premium sponsor must see the catalog base plus verified add-ons'
);
SELECT set_config('request.jwt.claim.sub', '', true);

-- A Free member of that household inherits the household subject and never
-- sees the sponsor as their own billing state.
SELECT set_config('request.jwt.claim.sub', '44030000-0000-4000-8000-000000000021', true);
SELECT pg_temp.assert_true(
    (
        SELECT user_display_tier = 'free'
           AND household_display_tier = 'premium'
           AND bank_connection_allowance = 4
           AND NOT is_premium_sponsor
           AND NOT is_family_bound
        FROM public.get_my_entitlements('44030000-0000-4000-9000-000000000001')
    ),
    'a sponsored member must resolve the household subject without sponsor billing state'
);
SELECT pg_temp.assert_true(
    (
        SELECT user_display_tier = 'free'
           AND household_display_tier IS NULL
           AND bank_connection_allowance = 0
           AND expires_at IS NULL
        FROM public.get_my_entitlements(NULL)
    ),
    'an unscoped read by a sponsored member must report only their own Free tier'
);
SELECT set_config('request.jwt.claim.sub', '', true);

-- Family binds to its household and carries the catalog allowance of four.
SELECT set_config('request.jwt.claim.sub', '44030000-0000-4000-8000-000000000023', true);
SELECT pg_temp.assert_true(
    (
        SELECT user_display_tier = 'free'
           AND household_display_tier = 'family'
           AND bank_connection_allowance = 4
           AND is_family_bound
           AND NOT is_premium_sponsor
           AND expires_at > server_time
        FROM public.get_my_entitlements('44030000-0000-4000-9000-000000000002')
    ),
    'a Family household member must resolve the Family household subject'
);

-- The same member cannot read a household they do not belong to.
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.get_my_entitlements('44030000-0000-4000-9000-000000000001');
    EXCEPTION
        WHEN insufficient_privilege THEN
            RETURN;
    END;
    RAISE EXCEPTION 'a cross-household minimized read unexpectedly succeeded';
END;
$$;
SELECT set_config('request.jwt.claim.sub', '', true);

-- An unrelated principal is denied both households.
SELECT set_config('request.jwt.claim.sub', '44030000-0000-4000-8000-000000000024', true);
DO $$
DECLARE
    v_household UUID;
BEGIN
    FOREACH v_household IN ARRAY ARRAY[
        '44030000-0000-4000-9000-000000000001'::UUID,
        '44030000-0000-4000-9000-000000000002'::UUID
    ] LOOP
        BEGIN
            PERFORM * FROM public.get_my_entitlements(v_household);
            RAISE EXCEPTION 'an outsider minimized read unexpectedly succeeded';
        EXCEPTION
            WHEN insufficient_privilege THEN
                CONTINUE;
        END;
    END LOOP;
END;
$$;
SELECT set_config('request.jwt.claim.sub', '', true);

-- Losing membership closes the household subject immediately.
UPDATE household_members
SET deleted_at = now()
WHERE id = '44030000-0000-4000-a000-000000000002';

SELECT set_config('request.jwt.claim.sub', '44030000-0000-4000-8000-000000000021', true);
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.get_my_entitlements('44030000-0000-4000-9000-000000000001');
    EXCEPTION
        WHEN insufficient_privilege THEN
            RETURN;
    END;
    RAISE EXCEPTION 'a removed member unexpectedly kept the household subject';
END;
$$;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- Unauthenticated reads fail closed
-- ---------------------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.expect_error(
    $sql$ SELECT * FROM public.get_my_entitlements(NULL) $sql$,
    '42501',
    'an unauthenticated minimized read must fail closed'
);
SELECT pg_temp.expect_error(
    $sql$
        SELECT * FROM public.get_my_entitlements('44030000-0000-4000-9000-000000000001')
    $sql$,
    '42501',
    'an unauthenticated household read must fail closed'
);

ROLLBACK;
