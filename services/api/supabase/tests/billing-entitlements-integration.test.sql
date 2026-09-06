-- SPDX-License-Identifier: BUSL-1.1

\set ON_ERROR_STOP on

-- Server-authoritative billing foundation integration test (#4400).
-- Run only against local Supabase:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/billing-entitlements-integration.test.sql

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

CREATE FUNCTION pg_temp.record_event(
    p_account UUID,
    p_identity UUID,
    p_event_id TEXT,
    p_subscription_id TEXT,
    p_item_id TEXT,
    p_effective_at TIMESTAMPTZ,
    p_provider_order BIGINT,
    p_event_type TEXT,
    p_lifecycle TEXT,
    p_product TEXT,
    p_tier TEXT,
    p_quantity BIGINT,
    p_period_end TIMESTAMPTZ DEFAULT NULL,
    p_grace_end TIMESTAMPTZ DEFAULT NULL,
    p_terminal_at TIMESTAMPTZ DEFAULT NULL,
    p_bound_household UUID DEFAULT NULL,
    p_trusted_reactivation BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE sql
AS $$
    SELECT public.record_billing_provider_event(
        p_account,
        p_identity,
        'stripe',
        'sandbox',
        p_event_id,
        p_subscription_id,
        p_item_id,
        now(),
        p_effective_at,
        p_provider_order,
        p_event_type,
        p_lifecycle,
        p_product,
        p_tier,
        p_quantity,
        p_period_end,
        p_grace_end,
        p_terminal_at,
        p_bound_household,
        p_trusted_reactivation
    );
$$;

-- ---------------------------------------------------------------------------
-- Schema, RLS, permissions, and fixed search paths
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 9
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
              'billing_accounts',
              'billing_provider_identities',
              'billing_provider_purchase_bindings',
              'billing_provider_purchase_aliases',
              'billing_subscriptions',
              'billing_provider_events',
              'entitlement_grants',
              'current_user_entitlements',
              'current_household_entitlements'
          )
          AND c.relrowsecurity
    ),
    'RLS must be enabled on every billing, grant, and projection table'
);

SELECT pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'billing_accounts', 'SELECT')
    AND NOT has_table_privilege(
        'authenticated',
        'billing_provider_purchase_bindings',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'billing_provider_purchase_aliases',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'service_role',
        'billing_provider_purchase_aliases',
        'INSERT'
    )
    AND NOT has_table_privilege('authenticated', 'billing_provider_events', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'entitlement_grants', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'current_user_entitlements', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'family_plan_subscriptions', 'SELECT'),
    'authenticated must have no direct billing, projection, or legacy table access'
);

SELECT pg_temp.assert_true(
    NOT has_function_privilege('authenticated', 'apply_billing_provider_event(uuid)', 'EXECUTE')
    AND NOT has_function_privilege(
        'authenticated',
        'resolve_revenuecat_purchase_binding(uuid,text,text,text,text[])',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'find_revenuecat_family_binding(uuid,text,text,text,text[])',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'revenuecat_purchase_grants_access(uuid,text,text,uuid,uuid)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'service_role',
        'resolve_revenuecat_purchase_binding(uuid,text,text,text,text[])',
        'EXECUTE'
    )
    AND has_function_privilege(
        'service_role',
        'find_revenuecat_family_binding(uuid,text,text,text,text[])',
        'EXECUTE'
    )
    AND has_function_privilege(
        'service_role',
        'revenuecat_purchase_grants_access(uuid,text,text,uuid,uuid)',
        'EXECUTE'
    )
    AND NOT has_function_privilege('authenticated', 'rebuild_billing_entitlements(uuid)', 'EXECUTE')
    AND NOT has_function_privilege(
        'authenticated',
        'lock_billing_accounts_internal(uuid[])',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'replay_billing_account_subscriptions_internal(uuid)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'authenticated',
        'set_my_premium_household_sponsorship(uuid)',
        'EXECUTE'
    )
    AND has_function_privilege('authenticated', 'get_my_entitlements(uuid)', 'EXECUTE'),
    'function grants must separate service and authenticated contracts'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname IN (
            'record_billing_provider_event',
            'apply_billing_provider_event',
            'resolve_revenuecat_purchase_binding',
            'find_revenuecat_family_binding',
            'revenuecat_purchase_grants_access',
            'rebuild_billing_entitlements',
            'billing_purchase_lock_key',
            'lock_billing_accounts_internal',
            'replay_billing_account_subscriptions_internal',
            'set_my_premium_household_sponsorship',
            'clear_my_premium_household_sponsorship',
            'get_my_entitlements'
        )
          AND NOT (proconfig @> ARRAY['search_path=public'])
    ),
    'all billing RPCs must pin search_path'
);

-- Mechanically verify lock order and key stability here; the companion
-- PowerShell test exercises these paths with independent database sessions.
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname IN (
            'record_billing_provider_event',
            'apply_billing_provider_event',
            'resolve_revenuecat_purchase_binding'
        )
          AND (
              strpos(prosrc, 'lock_billing_accounts_internal') = 0
              OR strpos(prosrc, 'pg_advisory_xact_lock') = 0
              OR strpos(prosrc, 'lock_billing_accounts_internal')
                  > strpos(prosrc, 'pg_advisory_xact_lock')
          )
    )
    AND (
        SELECT strpos(prosrc, 'ORDER BY a.id')
            < strpos(prosrc, 'FOR UPDATE')
        FROM pg_proc
        WHERE proname = 'lock_billing_accounts_internal'
    )
    AND (
        SELECT strpos(prosrc, 'FOR UPDATE')
            < strpos(prosrc, 'lock_billing_accounts_internal')
           AND strpos(prosrc, 'lock_billing_accounts_internal')
            < strpos(prosrc, 'rebuild_billing_account_entitlements_internal')
        FROM pg_proc
        WHERE proname = 'set_my_premium_household_sponsorship'
    )
    AND (
        SELECT strpos(prosrc, 'FOR UPDATE')
            < strpos(prosrc, 'lock_billing_accounts_internal')
           AND strpos(prosrc, 'lock_billing_accounts_internal')
            < strpos(prosrc, 'rebuild_billing_account_entitlements_internal')
           AND strpos(prosrc, 'array_agg(account_id ORDER BY account_id)') > 0
        FROM pg_proc
        WHERE proname = 'get_my_entitlements'
    )
    AND (
        SELECT strpos(prosrc, 'SELECT id, premium_sponsored_household_id') > 0
           AND strpos(prosrc, 'SELECT id, premium_sponsored_household_id')
                < strpos(prosrc, 'FOR UPDATE')
           AND strpos(prosrc, 'FOR UPDATE')
                < strpos(prosrc, 'v_current_household IS DISTINCT FROM')
        FROM pg_proc
        WHERE proname = 'clear_my_premium_household_sponsorship'
    )
    AND (
        SELECT strpos(prosrc, 'lock_billing_accounts_internal')
            < strpos(prosrc, 'UPDATE billing_accounts')
        FROM pg_proc
        WHERE proname = 'refresh_entitlements_after_membership_change'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname IN (
            'replay_billing_account_subscriptions_internal',
            'rebuild_billing_account_entitlements_internal'
        )
          AND strpos(prosrc, 'FOR UPDATE') > 0
    )
    AND billing_purchase_lock_key('stripe', 'sandbox', 'sub_lock', NULL)
        = billing_purchase_lock_key('stripe', 'sandbox', 'sub_lock', NULL)
    AND billing_purchase_lock_key('stripe', 'sandbox', 'sub_lock', NULL)
        <> billing_purchase_lock_key('stripe', 'sandbox', 'sub_lock', 'item_other'),
    'all paths must lock account row before stable sorted purchase locks'
);

-- ---------------------------------------------------------------------------
-- Tenant fixtures and stable billing identities
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
VALUES (
    '44000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'billing-test-4400@example.invalid',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
);

INSERT INTO users (id, email, display_name) VALUES
    ('44000000-0000-4000-8000-000000000001', 'billing-u1@example.invalid', 'Billing U1'),
    ('44000000-0000-4000-8000-000000000002', 'billing-u2@example.invalid', 'Billing U2'),
    ('44000000-0000-4000-8000-000000000003', 'billing-u3@example.invalid', 'Billing U3'),
    ('44000000-0000-4000-8000-000000000004', 'billing-u4@example.invalid', 'Billing U4');

INSERT INTO households (id, name, created_by) VALUES
    (
        '44000000-0000-4000-9000-000000000001',
        'Billing Household One',
        '44000000-0000-4000-8000-000000000003'
    ),
    (
        '44000000-0000-4000-9000-000000000002',
        'Billing Household Two',
        '44000000-0000-4000-8000-000000000003'
    );

INSERT INTO household_members (id, household_id, user_id, role) VALUES
    (
        '44000000-0000-4000-a000-000000000001',
        '44000000-0000-4000-9000-000000000001',
        '44000000-0000-4000-8000-000000000001',
        'owner'
    ),
    (
        '44000000-0000-4000-a000-000000000002',
        '44000000-0000-4000-9000-000000000001',
        '44000000-0000-4000-8000-000000000002',
        'member'
    ),
    (
        '44000000-0000-4000-a000-000000000003',
        '44000000-0000-4000-9000-000000000002',
        '44000000-0000-4000-8000-000000000003',
        'owner'
    ),
    (
        '44000000-0000-4000-a000-000000000004',
        '44000000-0000-4000-9000-000000000002',
        '44000000-0000-4000-8000-000000000004',
        'member'
    );

INSERT INTO billing_accounts (id, owner_id) VALUES
    ('44000000-0000-4000-b000-000000000001', '44000000-0000-4000-8000-000000000001'),
    ('44000000-0000-4000-b000-000000000002', '44000000-0000-4000-8000-000000000002'),
    ('44000000-0000-4000-b000-000000000003', '44000000-0000-4000-8000-000000000003'),
    ('44000000-0000-4000-b000-000000000005', '44000000-0000-4000-8000-000000000004');

UPDATE billing_accounts
SET owner_id = owner_id
WHERE id = '44000000-0000-4000-b000-000000000001';

SELECT pg_temp.expect_error(
    $sql$
        UPDATE billing_accounts
        SET owner_id = '44000000-0000-4000-8000-000000000002'
        WHERE id = '44000000-0000-4000-b000-000000000001'
    $sql$,
    '23514',
    'billing account ownership cannot transfer from one user to another'
);

INSERT INTO billing_accounts (id, owner_id)
VALUES ('44000000-0000-4000-b000-000000000004', NULL);

SELECT pg_temp.expect_error(
    $sql$
        UPDATE billing_accounts
        SET owner_id = '44000000-0000-4000-8000-000000000001'
        WHERE id = '44000000-0000-4000-b000-000000000004'
    $sql$,
    '23514',
    'a pseudonymous billing account cannot be reassigned'
);

INSERT INTO billing_provider_identities (
    id,
    billing_account_id,
    provider,
    environment,
    provider_customer_id,
    is_primary
)
VALUES
    (
        '44000000-0000-4000-c000-000000000001',
        '44000000-0000-4000-b000-000000000001',
        'stripe',
        'sandbox',
        'cus_4400_primary',
        true
    ),
    (
        '44000000-0000-4000-c000-000000000002',
        '44000000-0000-4000-b000-000000000001',
        'stripe',
        'sandbox',
        'cus_4400_alias',
        false
    ),
    (
        '44000000-0000-4000-c000-000000000003',
        '44000000-0000-4000-b000-000000000002',
        'stripe',
        'sandbox',
        'cus_4400_second',
        true
    ),
    (
        '44000000-0000-4000-c000-000000000004',
        '44000000-0000-4000-b000-000000000003',
        'stripe',
        'sandbox',
        'cus_4400_family',
        true
    ),
    (
        '44000000-0000-4000-c000-000000000005',
        '44000000-0000-4000-b000-000000000005',
        'stripe',
        'sandbox',
        'cus_4400_future_changes',
        true
    );

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2
        FROM billing_provider_identities
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000001'
    ),
    'one billing account must allow provider aliases/replacements'
);

SELECT pg_temp.expect_error(
    $sql$
        INSERT INTO billing_provider_identities (
            billing_account_id, provider, environment, provider_customer_id, is_primary
        ) VALUES (
            '44000000-0000-4000-b000-000000000001',
            'stripe', 'sandbox', 'cus_4400_other_primary', true
        )
    $sql$,
    '23505',
    'only one primary identity is allowed per account/provider/environment'
);

SELECT pg_temp.expect_error(
    $sql$
        INSERT INTO billing_provider_identities (
            billing_account_id, provider, environment, provider_customer_id
        ) VALUES (
            '44000000-0000-4000-b000-000000000001',
            'stripe', 'production', ''
        )
    $sql$,
    '23514',
    'provider customer IDs must be nonempty and bounded'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_binding_owner',
        'sub_binding_owner',
        NULL,
        statement_timestamp() - interval '1 day',
        1,
        'expired',
        'expired',
        'base_plan',
        'plus',
        1,
        NULL,
        NULL,
        statement_timestamp() - interval '1 day'
    )),
    'first evidence must bind the provider purchase key to its billing account'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000002',
        '44000000-0000-4000-c000-000000000003',
        'evt_binding_conflict',
        'sub_binding_owner',
        NULL,
        statement_timestamp(),
        2,
        'expired',
        'expired',
        'base_plan',
        'plus',
        1,
        NULL,
        NULL,
        statement_timestamp()
    )),
    'a provider purchase key cannot be rebound to another billing account'
);

SELECT pg_temp.assert_true(
    (
        SELECT billing_account_id =
            '44000000-0000-4000-b000-000000000001'
        FROM billing_provider_purchase_bindings
        WHERE provider = 'stripe'
          AND environment = 'sandbox'
          AND provider_subscription_id = 'sub_binding_owner'
          AND provider_subscription_item_id IS NULL
    )
    AND (
        SELECT processing_status = 'rejected'
           AND processing_reason =
               'provider purchase key is already bound to another billing account'
        FROM billing_provider_events
        WHERE provider_event_id = 'evt_binding_conflict'
    ),
    'conflicting evidence must persist rejected without changing purchase ownership'
);

-- ---------------------------------------------------------------------------
-- RevenueCat canonical purchase aliases
-- ---------------------------------------------------------------------------

INSERT INTO billing_provider_identities (
    id,
    billing_account_id,
    provider,
    environment,
    provider_customer_id,
    is_primary
)
VALUES
    (
        '44010000-0000-4000-c000-000000000001',
        '44000000-0000-4000-b000-000000000001',
        'revenuecat',
        'sandbox',
        'rc_customer_primary',
        true
    ),
    (
        '44010000-0000-4000-c000-000000000002',
        '44000000-0000-4000-b000-000000000002',
        'revenuecat',
        'sandbox',
        'rc_customer_conflict',
        true
    );

SELECT pg_temp.assert_true(
    public.resolve_revenuecat_purchase_binding(
        '44000000-0000-4000-b000-000000000001',
        'sandbox',
        NULL,
        'webhook_original_first',
        ARRAY['webhook_original_first', 'store_renewal_shared_first']
    ) = 'webhook_original_first',
    'webhook-first evidence must establish one immutable purchase binding'
);

SELECT pg_temp.assert_true(
    public.resolve_revenuecat_purchase_binding(
        '44000000-0000-4000-b000-000000000001',
        'sandbox',
        'rc_subscription_webhook_first',
        'store_earliest_reconcile_first',
        ARRAY[
            'store_earliest_reconcile_first',
            'store_renewal_middle_first',
            'store_renewal_shared_first'
        ]
    ) = 'webhook_original_first',
    'reconciliation must preserve a webhook canonical ID through a shared renewal alias'
);

SELECT pg_temp.assert_true(
    public.resolve_revenuecat_purchase_binding(
        '44000000-0000-4000-b000-000000000001',
        'sandbox',
        'rc_subscription_reconciliation_first',
        'store_earliest_reconciliation_first',
        ARRAY[
            'store_earliest_reconciliation_first',
            'store_renewal_middle_second',
            'store_renewal_shared_second'
        ]
    ) = 'store_earliest_reconciliation_first',
    'reconciliation-first evidence must establish its earliest transaction binding'
);

SELECT pg_temp.assert_true(
    public.resolve_revenuecat_purchase_binding(
        '44000000-0000-4000-b000-000000000001',
        'sandbox',
        NULL,
        'webhook_original_second',
        ARRAY['webhook_original_second', 'store_renewal_shared_second']
    ) = 'store_earliest_reconciliation_first',
    'webhook evidence must preserve a reconciliation canonical ID through a shared renewal alias'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(DISTINCT purchase_binding_id) = 2
           AND count(*) = 10
        FROM billing_provider_purchase_aliases
        WHERE provider = 'revenuecat'
          AND environment = 'sandbox'
    )
    AND (
        SELECT provider_subscription_id = 'webhook_original_first'
           AND billing_account_id = '44000000-0000-4000-b000-000000000001'
        FROM billing_provider_purchase_bindings
        WHERE id = (
            SELECT purchase_binding_id
            FROM billing_provider_purchase_aliases
            WHERE alias_kind = 'revenuecat_subscription_id'
              AND provider_alias = 'rc_subscription_webhook_first'
        )
    )
    AND (
        SELECT provider_subscription_id = 'store_earliest_reconciliation_first'
        FROM billing_provider_purchase_bindings
        WHERE id = (
            SELECT purchase_binding_id
            FROM billing_provider_purchase_aliases
            WHERE alias_kind = 'store_transaction_id'
              AND provider_alias = 'webhook_original_second'
        )
    ),
    'all cross-surface aliases must target the binding established by the first surface'
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT public.resolve_revenuecat_purchase_binding(
            '44000000-0000-4000-b000-000000000002',
            'sandbox',
            'rc_subscription_conflict',
            'store_original_conflict',
            ARRAY['store_original_conflict', 'store_renewal_shared_first']
        )
    $sql$,
    '23514',
    'an authoritative alias cannot be rebound to another billing account'
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT public.resolve_revenuecat_purchase_binding(
            '44000000-0000-4000-b000-000000000001',
            'sandbox',
            'rc_subscription_webhook_first',
            'store_conflicting_bridge',
            ARRAY['store_conflicting_bridge', 'store_renewal_shared_second']
        )
    $sql$,
    '23514',
    'aliases spanning two existing purchase bindings must be rejected'
);

SELECT pg_temp.expect_error(
    $sql$
        UPDATE billing_provider_purchase_aliases
        SET provider_alias = 'store_mutated'
        WHERE provider_alias = 'store_renewal_middle_first'
    $sql$,
    '23514',
    'RevenueCat purchase aliases must be immutable'
);

SELECT pg_temp.expect_error(
    $sql$
        DELETE FROM billing_provider_purchase_aliases
        WHERE provider_alias = 'store_renewal_middle_first'
    $sql$,
    '23514',
    'RevenueCat purchase aliases cannot be deleted'
);

-- A legacy row is compatibility data only and can never produce a grant.
INSERT INTO family_plan_subscriptions (
    id,
    household_id,
    billing_owner_id,
    owner_id,
    price_cents
)
VALUES (
    '44000000-0000-4000-d000-000000000001',
    '44000000-0000-4000-9000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    1499
);

SELECT public.rebuild_billing_entitlements(NULL);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 0
        FROM entitlement_grants
        WHERE billing_account_id IN (
            '44000000-0000-4000-b000-000000000001',
            '44000000-0000-4000-b000-000000000002',
            '44000000-0000-4000-b000-000000000003',
            '44000000-0000-4000-b000-000000000005'
        )
    )
    AND (
        SELECT processing_status = 'rejected'
        FROM billing_provider_events
        WHERE provider_event_id = 'evt_binding_conflict'
    ),
    'unverified legacy family rows must grant nothing'
);

-- Invalid Family/add-on binding shapes are rejected before evidence is stored.
SELECT pg_temp.expect_error(
    $sql$
        SELECT pg_temp.record_event(
            '44000000-0000-4000-b000-000000000003',
            '44000000-0000-4000-c000-000000000004',
            'evt_invalid_family',
            'sub_invalid_family',
            NULL,
            now() - interval '1 day',
            1,
            'activated',
            'active',
            'base_plan',
            'family',
            1,
            now() + interval '1 month'
        )
    $sql$,
    '23514',
    'Family evidence requires an immutable household binding'
);

SELECT pg_temp.expect_error(
    $sql$
        SELECT pg_temp.record_event(
            '44000000-0000-4000-b000-000000000001',
            '44000000-0000-4000-c000-000000000001',
            'evt_invalid_addon',
            'sub_invalid_addon',
            'item_invalid_addon',
            now() - interval '1 day',
            1,
            'activated',
            'active',
            'premium_bank_addon',
            NULL,
            1,
            now() + interval '1 month',
            NULL,
            NULL,
            '44000000-0000-4000-9000-000000000001'
        )
    $sql$,
    '23514',
    'add-on evidence must not carry a Family household binding'
);

-- ---------------------------------------------------------------------------
-- Active base plans, same-account add-ons, and deterministic max projection
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_1',
        'sub_premium_1',
        NULL,
        now() - interval '2 days',
        10,
        'activated',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days'
    )),
    'first Premium event must apply'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000002',
        'evt_addon_1',
        'sub_addon_1',
        'item_addon_1',
        now() - interval '2 days',
        1,
        'activated',
        'active',
        'premium_bank_addon',
        NULL,
        3,
        now() + interval '20 days'
    )),
    'same-account Premium add-on event must apply through an alias identity'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_addon_2',
        'sub_addon_2',
        'item_addon_2',
        now() - interval '2 days',
        1,
        'activated',
        'active',
        'premium_bank_addon',
        NULL,
        150,
        now() + interval '20 days'
    )),
    'multiple add-on purchases for one billing account must be accepted'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000002',
        '44000000-0000-4000-c000-000000000003',
        'evt_premium_2',
        'sub_premium_2',
        NULL,
        now() - interval '2 days',
        1,
        'activated',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days'
    )),
    'second Premium sponsor event must apply'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000002',
        '44000000-0000-4000-c000-000000000003',
        'evt_addon_other_sponsor',
        'sub_addon_other_sponsor',
        'item_addon_other_sponsor',
        now() - interval '2 days',
        1,
        'activated',
        'active',
        'premium_bank_addon',
        NULL,
        200,
        now() + interval '20 days'
    )),
    'another sponsor may have its own independent add-on quantity'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_family_1',
        'sub_family_1',
        NULL,
        now() - interval '2 days',
        1,
        'activated',
        'active',
        'base_plan',
        'family',
        1,
        now() + interval '30 days',
        NULL,
        NULL,
        '44000000-0000-4000-9000-000000000001'
    )),
    'Family event with a binding must apply'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000001',
    true
);
SELECT public.set_my_premium_household_sponsorship(
    '44000000-0000-4000-9000-000000000001'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000002',
    true
);
SELECT public.set_my_premium_household_sponsorship(
    '44000000-0000-4000-9000-000000000001'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    (
        SELECT display_tier = 'premium'
           AND bank_connection_allowance = 202
           AND is_premium_sponsored
        FROM current_household_entitlements
        WHERE household_id = '44000000-0000-4000-9000-000000000001'
    ),
    'allowance must be max(Family 4, sponsor-one 2+153, sponsor-two 2+200), not a cross-sponsor sum'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 2 AND COALESCE(sum(quantity), 0) = 153
        FROM entitlement_grants
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000001'
          AND beneficiary_household_id = '44000000-0000-4000-9000-000000000001'
          AND grant_type = 'premium_addon'
          AND revoked_at IS NULL
    )
    AND (
        SELECT count(*) = 1 AND COALESCE(sum(quantity), 0) = 200
        FROM entitlement_grants
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000002'
          AND beneficiary_household_id = '44000000-0000-4000-9000-000000000001'
          AND grant_type = 'premium_addon'
          AND revoked_at IS NULL
    ),
    'same-account add-ons sum without imposing an unratified catalog ceiling'
);

-- The RPC contract is minimized and denies an outsider household.
SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000001',
    true
);
SELECT pg_temp.assert_true(
    (
        SELECT user_display_tier = 'premium'
           AND household_display_tier = 'premium'
           AND bank_connection_allowance = 202
           AND is_premium_sponsor
           AND projection_version > 0
           AND server_time IS NOT NULL
        FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000001'
        )
    ),
    'member RPC must return only the minimized effective projection'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        CROSS JOIN LATERAL unnest(COALESCE(p.proargnames, ARRAY[]::TEXT[])) AS arg(name)
        WHERE p.proname = 'get_my_entitlements'
          AND (
              arg.name ILIKE '%provider%'
              OR arg.name ILIKE '%customer%'
              OR arg.name ILIKE '%receipt%'
              OR arg.name ILIKE '%price%'
          )
    ),
    'RPC return and input names must not expose provider/customer/receipt/price fields'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000002',
    true
);
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000002'
        );
    EXCEPTION
        WHEN insufficient_privilege THEN
            RETURN;
    END;
    RAISE EXCEPTION 'cross-household entitlement RPC unexpectedly succeeded';
END;
$$;
RESET ROLE;

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000002',
        '44000000-0000-4000-c000-000000000003',
        'evt_premium_2_grace',
        'sub_premium_2',
        NULL,
        now() - interval '1 day',
        2,
        'past_due',
        'past_due_grace',
        'base_plan',
        'premium',
        1,
        NULL,
        now() + interval '3 days'
    )),
    'past-due grace evidence must apply'
);

SELECT pg_temp.assert_true(
    (
        SELECT lifecycle = 'past_due_grace' AND grace_end > now()
        FROM billing_subscriptions
        WHERE provider_subscription_id = 'sub_premium_2'
    )
    AND EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000002'
          AND grant_type = 'direct_user'
          AND revoked_at IS NULL
          AND expires_at > now()
    ),
    'past_due_grace must grant only through the trusted grace end'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000002',
        '44000000-0000-4000-c000-000000000003',
        'evt_premium_2_paused',
        'sub_premium_2',
        NULL,
        now() - interval '12 hours',
        3,
        'paused',
        'paused_paid_through',
        'base_plan',
        'premium',
        1,
        now() + interval '4 days'
    )),
    'paused paid-through evidence must apply'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000002'
          AND grant_type = 'direct_user'
          AND revoked_at IS NULL
          AND expires_at > now()
    ),
    'paused_paid_through must retain access until the paid period ends'
);

-- Every accepted future state change is scheduled and caps current authority,
-- including non-terminal plan and quantity changes.
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_future_family_active',
        'sub_future_family_change',
        NULL,
        statement_timestamp() - interval '1 day',
        1,
        'activated',
        'active',
        'base_plan',
        'family',
        1,
        statement_timestamp() + interval '30 days',
        NULL,
        NULL,
        '44000000-0000-4000-9000-000000000002'
    )),
    'future Family downgrade fixture must start active'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_future_family_plus',
        'sub_future_family_change',
        NULL,
        statement_timestamp() + interval '600 milliseconds',
        2,
        'renewed',
        'active',
        'base_plan',
        'plus',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'future Family to Plus change must schedule'
);

SELECT pg_temp.assert_true(
    (
        SELECT lifecycle = 'active'
           AND tier = 'family'
           AND next_effective_at IS NOT NULL
        FROM billing_subscriptions
        WHERE provider_subscription_id = 'sub_future_family_change'
    )
    AND (
        SELECT display_tier = 'family'
           AND bank_connection_allowance = 4
           AND expires_at = (
               SELECT effective_at
               FROM billing_provider_events
               WHERE provider_event_id = 'evt_future_family_plus'
           )
        FROM current_household_entitlements
        WHERE household_id = '44000000-0000-4000-9000-000000000002'
    )
    AND (
        SELECT processing_status = 'scheduled'
        FROM billing_provider_events
        WHERE provider_event_id = 'evt_future_family_plus'
    ),
    'Family capability must remain active only through the scheduled downgrade boundary'
);

SELECT pg_sleep(0.8);
SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000003',
    true
);
SELECT pg_temp.assert_true(
    (
        SELECT household_display_tier = 'free'
           AND bank_connection_allowance = 0
        FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000002'
        )
    ),
    'Family to Plus must end household capability exactly when due'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    (
        SELECT tier = 'plus'
           AND bound_household_id IS NULL
           AND historical_family_household_id =
               '44000000-0000-4000-9000-000000000002'
        FROM billing_subscriptions
        WHERE provider_subscription_id = 'sub_future_family_change'
    ),
    'Family downgrade must preserve immutable historical binding'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000005',
        '44000000-0000-4000-c000-000000000005',
        'evt_future_premium_active',
        'sub_future_premium_change',
        NULL,
        statement_timestamp() - interval '1 day',
        1,
        'activated',
        'active',
        'base_plan',
        'premium',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'future Premium downgrade fixture must start active'
);
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000005',
        '44000000-0000-4000-c000-000000000005',
        'evt_future_addon_reduce_active',
        'sub_future_addon_reduce',
        'item_future_addon_reduce',
        statement_timestamp() - interval '1 day',
        1,
        'activated',
        'active',
        'premium_bank_addon',
        NULL,
        10,
        statement_timestamp() + interval '30 days'
    )),
    'quantity reduction fixture must start active'
);
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000005',
        '44000000-0000-4000-c000-000000000005',
        'evt_future_addon_remove_active',
        'sub_future_addon_remove',
        'item_future_addon_remove',
        statement_timestamp() - interval '1 day',
        1,
        'activated',
        'active',
        'premium_bank_addon',
        NULL,
        5,
        statement_timestamp() + interval '30 days'
    )),
    'add-on removal fixture must start active'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000004',
    true
);
SELECT public.set_my_premium_household_sponsorship(
    '44000000-0000-4000-9000-000000000002'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    (
        SELECT bank_connection_allowance = 17
        FROM current_household_entitlements
        WHERE household_id = '44000000-0000-4000-9000-000000000002'
    ),
    'same-account add-ons must initially sum to Premium 2 + 10 + 5'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000005',
        '44000000-0000-4000-c000-000000000005',
        'evt_future_addon_reduce',
        'sub_future_addon_reduce',
        'item_future_addon_reduce',
        statement_timestamp() + interval '600 milliseconds',
        2,
        'quantity_changed',
        'active',
        'premium_bank_addon',
        NULL,
        2,
        statement_timestamp() + interval '30 days'
    )),
    'future add-on quantity reduction must schedule'
);
SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000005',
        '44000000-0000-4000-c000-000000000005',
        'evt_future_addon_remove',
        'sub_future_addon_remove',
        'item_future_addon_remove',
        statement_timestamp() + interval '600 milliseconds',
        2,
        'expired',
        'expired',
        'premium_bank_addon',
        NULL,
        5,
        NULL,
        NULL,
        statement_timestamp() + interval '600 milliseconds'
    )),
    'future add-on removal must schedule'
);

SELECT pg_temp.assert_true(
    (
        SELECT bank_connection_allowance = 17
           AND expires_at = (
               SELECT MIN(effective_at)
               FROM billing_provider_events
               WHERE provider_event_id IN (
                   'evt_future_addon_reduce',
                   'evt_future_addon_remove'
               )
           )
        FROM current_household_entitlements
        WHERE household_id = '44000000-0000-4000-9000-000000000002'
    )
    AND (
        SELECT count(*) = 2
        FROM billing_provider_events
        WHERE provider_event_id IN (
            'evt_future_addon_reduce',
            'evt_future_addon_remove'
        )
          AND processing_status = 'scheduled'
    ),
    'old add-on allowance must end at the earliest scheduled quantity boundary'
);

SELECT pg_sleep(0.8);
SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000004',
    true
);
SELECT pg_temp.assert_true(
    (
        SELECT bank_connection_allowance = 4
           AND is_premium_sponsor
        FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000002'
        )
    ),
    'due add-on changes must yield Premium 2 + reduced quantity 2'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000005',
        '44000000-0000-4000-c000-000000000005',
        'evt_future_premium_plus',
        'sub_future_premium_change',
        NULL,
        statement_timestamp() + interval '600 milliseconds',
        2,
        'renewed',
        'active',
        'base_plan',
        'plus',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'future Premium to Plus change must schedule'
);

SELECT pg_temp.assert_true(
    (
        SELECT bank_connection_allowance = 4
           AND is_premium_sponsored
           AND expires_at = (
               SELECT effective_at
               FROM billing_provider_events
               WHERE provider_event_id = 'evt_future_premium_plus'
           )
        FROM current_household_entitlements
        WHERE household_id = '44000000-0000-4000-9000-000000000002'
    )
    AND (
        SELECT processing_status = 'scheduled'
        FROM billing_provider_events
        WHERE provider_event_id = 'evt_future_premium_plus'
    ),
    'Premium sponsorship must remain active only through its downgrade boundary'
);

SELECT pg_sleep(0.8);
SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000004',
    true
);
SELECT pg_temp.assert_true(
    (
        SELECT user_display_tier = 'plus'
           AND household_display_tier = 'free'
           AND bank_connection_allowance = 0
           AND NOT is_premium_sponsor
        FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000002'
        )
    ),
    'Premium to Plus must end sponsorship and add-on capability exactly when due'
);
RESET ROLE;

-- Ordered plan/SKU changes may reuse one provider purchase identity. The first
-- Family binding is retained historically even after a downgrade.
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_transition_plus',
        'sub_transition',
        'item_transition',
        statement_timestamp() - interval '5 days',
        1,
        'activated',
        'active',
        'base_plan',
        'plus',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'initial Plus purchase state must apply'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_transition_premium',
        'sub_transition',
        'item_transition',
        statement_timestamp() - interval '4 days',
        2,
        'renewed',
        'active',
        'base_plan',
        'premium',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'Plus to Premium upgrade under one provider purchase must apply'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_transition_family',
        'sub_transition',
        'item_transition',
        statement_timestamp() - interval '3 days',
        3,
        'renewed',
        'active',
        'base_plan',
        'family',
        1,
        statement_timestamp() + interval '30 days',
        NULL,
        NULL,
        '44000000-0000-4000-9000-000000000002'
    )),
    'individual to Family upgrade may establish the first Family binding'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_transition_downgrade',
        'sub_transition',
        'item_transition',
        statement_timestamp() - interval '2 days',
        4,
        'renewed',
        'active',
        'base_plan',
        'plus',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'Family to Plus downgrade may clear only the current Family scope'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_transition_family_return',
        'sub_transition',
        'item_transition',
        statement_timestamp() - interval '1 day',
        5,
        'renewed',
        'active',
        'base_plan',
        'family',
        1,
        statement_timestamp() + interval '30 days',
        NULL,
        NULL,
        '44000000-0000-4000-9000-000000000002'
    )),
    'returning to the originally bound Family household must apply'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_transition_family_transfer',
        'sub_transition',
        'item_transition',
        statement_timestamp() - interval '12 hours',
        6,
        'renewed',
        'active',
        'base_plan',
        'family',
        1,
        statement_timestamp() + interval '30 days',
        NULL,
        NULL,
        '44000000-0000-4000-9000-000000000001'
    )),
    'a Family purchase can never transfer to another household'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_transition_addon_sku',
        'sub_transition',
        'item_transition',
        statement_timestamp() - interval '8 hours',
        7,
        'quantity_changed',
        'active',
        'premium_bank_addon',
        NULL,
        2,
        statement_timestamp() + interval '30 days'
    )),
    'ordered logical SKU change must apply under the same provider item identity'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_transition_premium_return',
        'sub_transition',
        'item_transition',
        statement_timestamp() - interval '6 hours',
        8,
        'renewed',
        'active',
        'base_plan',
        'premium',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'logical SKU may return to a base plan through newer verified evidence'
);

SELECT pg_temp.assert_true(
    (
        SELECT logical_product = 'base_plan'
           AND tier = 'premium'
           AND bound_household_id IS NULL
           AND historical_family_household_id =
               '44000000-0000-4000-9000-000000000002'
        FROM billing_subscriptions
        WHERE provider_subscription_id = 'sub_transition'
    )
    AND (
        SELECT processing_status = 'rejected'
        FROM billing_provider_events
        WHERE provider_event_id = 'evt_transition_family_transfer'
    ),
    'ordered plan state must preserve immutable historical Family binding'
);

-- Future terminal evidence is scheduled. Existing access remains authoritative
-- until a rebuild at or after the trusted effective boundary.
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_future_expiry_active',
        'sub_future_expiry',
        NULL,
        statement_timestamp() - interval '1 minute',
        1,
        'activated',
        'active',
        'base_plan',
        'plus',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'future-expiry fixture must start active'
);
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_future_refund_active',
        'sub_future_refund',
        NULL,
        statement_timestamp() - interval '1 minute',
        1,
        'activated',
        'active',
        'base_plan',
        'plus',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'future-refund fixture must start active'
);
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_future_chargeback_active',
        'sub_future_chargeback',
        NULL,
        statement_timestamp() - interval '1 minute',
        1,
        'activated',
        'active',
        'base_plan',
        'plus',
        1,
        statement_timestamp() + interval '30 days'
    )),
    'future-chargeback fixture must start active'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_future_expiry_terminal',
        'sub_future_expiry',
        NULL,
        statement_timestamp() + interval '600 milliseconds',
        2,
        'expired',
        'expired',
        'base_plan',
        'plus',
        1,
        NULL,
        NULL,
        statement_timestamp() + interval '600 milliseconds'
    )),
    'future expiry must schedule rather than mutate current state'
);
SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_future_refund_terminal',
        'sub_future_refund',
        NULL,
        statement_timestamp() + interval '600 milliseconds',
        2,
        'refunded',
        'refunded',
        'base_plan',
        'plus',
        1,
        NULL,
        NULL,
        statement_timestamp() + interval '600 milliseconds'
    )),
    'future refund must schedule rather than mutate current state'
);
SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000003',
        '44000000-0000-4000-c000-000000000004',
        'evt_future_chargeback_terminal',
        'sub_future_chargeback',
        NULL,
        statement_timestamp() + interval '600 milliseconds',
        2,
        'chargeback',
        'chargeback',
        'base_plan',
        'plus',
        1,
        NULL,
        NULL,
        statement_timestamp() + interval '600 milliseconds'
    )),
    'future chargeback must schedule rather than mutate current state'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 3
        FROM billing_subscriptions
        WHERE provider_subscription_id IN (
            'sub_future_expiry',
            'sub_future_refund',
            'sub_future_chargeback'
        )
          AND lifecycle = 'active'
    )
    AND (
        SELECT count(*) = 3
        FROM entitlement_grants g
        JOIN billing_subscriptions s ON s.id = g.subscription_id
        WHERE s.provider_subscription_id IN (
            'sub_future_expiry',
            'sub_future_refund',
            'sub_future_chargeback'
        )
          AND g.revoked_at IS NULL
    )
    AND (
        SELECT count(*) = 3
        FROM billing_provider_events
        WHERE provider_event_id IN (
            'evt_future_expiry_terminal',
            'evt_future_refund_terminal',
            'evt_future_chargeback_terminal'
        )
          AND processing_status = 'scheduled'
    )
    AND (
        SELECT count(*) = 3
        FROM entitlement_grants g
        JOIN billing_subscriptions s ON s.id = g.subscription_id
        JOIN billing_provider_events e
          ON e.provider = s.provider
         AND e.environment = s.environment
         AND e.provider_subscription_id = s.provider_subscription_id
         AND e.provider_subscription_item_id IS NOT DISTINCT FROM
             s.provider_subscription_item_id
        WHERE s.provider_subscription_id IN (
            'sub_future_expiry',
            'sub_future_refund',
            'sub_future_chargeback'
        )
          AND e.provider_event_id IN (
              'evt_future_expiry_terminal',
              'evt_future_refund_terminal',
              'evt_future_chargeback_terminal'
          )
          AND g.revoked_at IS NULL
          AND g.expires_at = e.effective_at
    ),
    'future terminal evidence must preserve and cap access at its effective boundary'
);

SELECT pg_sleep(0.8);
SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000003',
    true
);
SELECT count(*) FROM public.get_my_entitlements(NULL);
RESET ROLE;

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 3
        FROM billing_subscriptions
        WHERE (
            provider_subscription_id = 'sub_future_expiry'
            AND lifecycle = 'expired'
        )
        OR (
            provider_subscription_id = 'sub_future_refund'
            AND lifecycle = 'refunded'
        )
        OR (
            provider_subscription_id = 'sub_future_chargeback'
            AND lifecycle = 'chargeback'
        )
    )
    AND NOT EXISTS (
        SELECT 1
        FROM entitlement_grants g
        JOIN billing_subscriptions s ON s.id = g.subscription_id
        WHERE s.provider_subscription_id IN (
            'sub_future_expiry',
            'sub_future_refund',
            'sub_future_chargeback'
        )
          AND g.revoked_at IS NULL
    ),
    'expiry/refund/chargeback must revoke deterministically at the effective boundary'
);

-- ---------------------------------------------------------------------------
-- Idempotency, append-only evidence, ordering, lifecycle, and irreversibility
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
    pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_1',
        'sub_premium_1',
        NULL,
        now() - interval '2 days',
        10,
        'activated',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days'
    ) = (
        SELECT id
        FROM billing_provider_events
        WHERE provider_event_id = 'evt_premium_1'
    ),
    'duplicate provider event IDs must resolve to the original evidence row'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event((
        SELECT id FROM billing_provider_events WHERE provider_event_id = 'evt_premium_1'
    )),
    'reapplying an already processed event must be a no-op'
);

SELECT pg_temp.expect_error(
    $sql$
        UPDATE billing_provider_events
        SET effective_at = effective_at + interval '1 second'
        WHERE provider_event_id = 'evt_premium_1'
    $sql$,
    '23514',
    'normalized evidence fields must be immutable'
);

SELECT pg_temp.expect_error(
    $sql$
        DELETE FROM billing_provider_events
        WHERE provider_event_id = 'evt_premium_1'
    $sql$,
    '23514',
    'provider evidence must be append-only'
);

-- Cancellation at equal provider time wins by deterministic lifecycle
-- precedence and preserves access through the paid period.
SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_cancel',
        'sub_premium_1',
        NULL,
        now() - interval '2 days',
        10,
        'cancelled',
        'cancelled_paid_through',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days'
    )),
    'equal-time cancellation must supersede active by precedence'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000001'
          AND grant_type = 'direct_user'
          AND revoked_at IS NULL
          AND expires_at > now()
    ),
    'cancelled_paid_through must retain direct access until period end'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_equal_active',
        'sub_premium_1',
        NULL,
        now() - interval '2 days',
        10,
        'activated',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '31 days'
    )),
    'lower-precedence equal-time evidence must be stale'
);

SELECT pg_temp.assert_true(
    (
        SELECT processing_status = 'stale'
        FROM billing_provider_events
        WHERE provider_event_id = 'evt_premium_equal_active'
    ),
    'equal-time lower-precedence evidence must be marked stale'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_older',
        'sub_premium_1',
        NULL,
        now() - interval '3 days',
        999,
        'renewed',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '31 days'
    )),
    'an older effective event cannot overwrite newer evidence'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_expired',
        'sub_premium_1',
        NULL,
        now() - interval '1 day',
        11,
        'expired',
        'expired',
        'base_plan',
        'premium',
        1,
        NULL,
        NULL,
        now() - interval '1 day'
    )),
    'newer expiry must apply'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000001',
    true
);
SELECT pg_temp.assert_true(
    NOT (
        SELECT is_premium_sponsor
        FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000001'
        )
    ),
    'expired Premium must not report sponsorship from a retained pointer'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_nonmonotonic_reactivate',
        'sub_premium_1',
        NULL,
        now() - interval '11 hours',
        11,
        'renewed',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days',
        NULL,
        NULL,
        NULL,
        true
    )),
    'trusted reactivation must still have strictly newer provider ordering'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_untrusted_reactivate',
        'sub_premium_1',
        NULL,
        now() - interval '12 hours',
        12,
        'reactivated',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days'
    )),
    'expiry must not reactivate without explicit trusted normalization'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_untrusted_trial',
        'sub_premium_1',
        NULL,
        now() - interval '10 hours',
        13,
        'trial_started',
        'trialing',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days'
    )),
    'expired must reject an untrusted trialing transition'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_untrusted_grace',
        'sub_premium_1',
        NULL,
        now() - interval '9 hours',
        14,
        'past_due',
        'past_due_grace',
        'base_plan',
        'premium',
        1,
        NULL,
        now() + interval '3 days'
    )),
    'expired must reject an untrusted past-due grace transition'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_untrusted_cancelled',
        'sub_premium_1',
        NULL,
        now() - interval '8 hours',
        15,
        'cancelled',
        'cancelled_paid_through',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days'
    )),
    'expired must reject an untrusted cancelled-paid-through transition'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_untrusted_paused',
        'sub_premium_1',
        NULL,
        now() - interval '7 hours',
        16,
        'paused',
        'paused_paid_through',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days'
    )),
    'expired must reject an untrusted paused-paid-through transition'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 5
        FROM billing_provider_events
        WHERE provider_event_id IN (
            'evt_premium_untrusted_reactivate',
            'evt_premium_untrusted_trial',
            'evt_premium_untrusted_grace',
            'evt_premium_untrusted_cancelled',
            'evt_premium_untrusted_paused'
        )
          AND processing_status = 'rejected'
    ),
    'all access-bearing lifecycle transitions after expiry require trusted renewal'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_trusted_reactivate',
        'sub_premium_1',
        NULL,
        now() - interval '6 hours',
        20,
        'reactivated',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days',
        NULL,
        NULL,
        NULL,
        true
    )),
    'strictly newer trusted reactivation may reuse the provider subscription ID'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000001',
    true
);
SELECT pg_temp.assert_true(
    (
        SELECT is_premium_sponsor
        FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000001'
        )
    ),
    'trusted active Premium grant must restore sponsorship status'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_refund',
        'sub_premium_1',
        NULL,
        now() - interval '1 hour',
        21,
        'refunded',
        'refunded',
        'base_plan',
        'premium',
        1,
        NULL,
        NULL,
        now() - interval '1 hour'
    )),
    'refund must apply and revoke access'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000001',
        '44000000-0000-4000-c000-000000000001',
        'evt_premium_after_refund',
        'sub_premium_1',
        NULL,
        now(),
        22,
        'renewed',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days',
        NULL,
        NULL,
        NULL,
        true
    )),
    'refund must be irreversible for the same purchase evidence'
);

SELECT pg_temp.assert_true(
    (
        SELECT lifecycle = 'refunded'
        FROM billing_subscriptions
        WHERE provider_subscription_id = 'sub_premium_1'
    )
    AND (
        SELECT processing_status = 'rejected'
        FROM billing_provider_events
        WHERE provider_event_id = 'evt_premium_after_refund'
    ),
    'post-refund renewal cannot resurrect the purchase'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000001',
    true
);
SELECT pg_temp.assert_true(
    NOT (
        SELECT is_premium_sponsor
        FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000001'
        )
    ),
    'refunded Premium must not report sponsorship from a retained pointer'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000002',
        '44000000-0000-4000-c000-000000000003',
        'evt_premium_2_chargeback',
        'sub_premium_2',
        NULL,
        now() - interval '15 minutes',
        4,
        'chargeback',
        'chargeback',
        'base_plan',
        'premium',
        1,
        NULL,
        NULL,
        now() - interval '15 minutes'
    )),
    'chargeback evidence must apply'
);

SELECT pg_temp.assert_true(
    NOT public.apply_billing_provider_event(pg_temp.record_event(
        '44000000-0000-4000-b000-000000000002',
        '44000000-0000-4000-c000-000000000003',
        'evt_premium_2_after_chargeback',
        'sub_premium_2',
        NULL,
        now(),
        5,
        'reactivated',
        'active',
        'base_plan',
        'premium',
        1,
        now() + interval '30 days',
        NULL,
        NULL,
        NULL,
        true
    )),
    'chargeback must be irreversible for the same purchase evidence'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claim.sub',
    '44000000-0000-4000-8000-000000000002',
    true
);
SELECT pg_temp.assert_true(
    NOT (
        SELECT is_premium_sponsor
        FROM public.get_my_entitlements(
            '44000000-0000-4000-9000-000000000001'
        )
    ),
    'charged-back Premium must not report sponsorship from a retained pointer'
);
RESET ROLE;

-- Membership loss still clears the stored intent and closes same-account
-- add-ons. Family remains independently effective for the household.
UPDATE household_members
SET deleted_at = statement_timestamp()
WHERE id = '44000000-0000-4000-a000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT premium_sponsored_household_id IS NULL
        FROM billing_accounts
        WHERE id = '44000000-0000-4000-b000-000000000001'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000001'
          AND grant_type IN ('premium_sponsorship', 'premium_addon')
          AND revoked_at IS NULL
    )
    AND (
        SELECT display_tier = 'family' AND bank_connection_allowance = 4
        FROM current_household_entitlements
        WHERE household_id = '44000000-0000-4000-9000-000000000001'
    ),
    'membership loss must clear sponsorship/add-ons and preserve Family fallback'
);

UPDATE household_members
SET deleted_at = NULL
WHERE id = '44000000-0000-4000-a000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT premium_sponsored_household_id IS NULL
        FROM billing_accounts
        WHERE id = '44000000-0000-4000-b000-000000000001'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000001'
          AND grant_type IN ('premium_sponsorship', 'premium_addon')
          AND revoked_at IS NULL
    ),
    'membership reactivation must not restore cleared sponsorship intent'
);

-- A clean-state rebuild must derive mutable subscriptions, active grants, and
-- projections from immutable events rather than trusting subscription rows.
CREATE TEMP TABLE expected_replay_subscriptions ON COMMIT DROP AS
SELECT
    provider,
    environment,
    provider_subscription_id,
    provider_subscription_item_id,
    logical_product,
    tier,
    quantity,
    lifecycle,
    bound_household_id,
    historical_family_household_id,
    current_period_end,
    grace_end,
    terminal_at,
    last_effective_at,
    last_provider_order,
    last_event_precedence,
    last_provider_event_id
FROM billing_subscriptions
WHERE billing_account_id IN (
    '44000000-0000-4000-b000-000000000001',
    '44000000-0000-4000-b000-000000000002',
    '44000000-0000-4000-b000-000000000003'
);

CREATE TEMP TABLE expected_replay_grants ON COMMIT DROP AS
SELECT
    s.provider_subscription_id,
    s.provider_subscription_item_id,
    g.billing_account_id,
    g.grant_type,
    g.beneficiary_user_id,
    g.beneficiary_household_id,
    g.tier,
    g.quantity,
    g.effective_at,
    g.expires_at
FROM entitlement_grants g
JOIN billing_subscriptions s ON s.id = g.subscription_id
WHERE g.billing_account_id IN (
    '44000000-0000-4000-b000-000000000001',
    '44000000-0000-4000-b000-000000000002',
    '44000000-0000-4000-b000-000000000003'
)
  AND g.revoked_at IS NULL;

CREATE TEMP TABLE expected_replay_users ON COMMIT DROP AS
SELECT user_id, display_tier, expires_at
FROM current_user_entitlements
WHERE user_id IN (
    '44000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000002',
    '44000000-0000-4000-8000-000000000003'
);

CREATE TEMP TABLE expected_replay_households ON COMMIT DROP AS
SELECT
    household_id,
    display_tier,
    is_premium_sponsored,
    bank_connection_allowance,
    expires_at
FROM current_household_entitlements
WHERE household_id IN (
    '44000000-0000-4000-9000-000000000001',
    '44000000-0000-4000-9000-000000000002'
);

CREATE TEMP TABLE expected_replay_evidence ON COMMIT DROP AS
SELECT
    id,
    provider,
    environment,
    provider_event_id,
    provider_subscription_id,
    provider_subscription_item_id,
    effective_at,
    provider_order,
    event_type,
    normalized_lifecycle,
    normalized_logical_product,
    normalized_tier,
    normalized_quantity,
    normalized_bound_household_id,
    trusted_reactivation
FROM billing_provider_events
WHERE billing_account_id IN (
    '44000000-0000-4000-b000-000000000001',
    '44000000-0000-4000-b000-000000000002',
    '44000000-0000-4000-b000-000000000003'
);

DELETE FROM current_user_entitlements
WHERE user_id IN (
    '44000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000002',
    '44000000-0000-4000-8000-000000000003'
);
DELETE FROM current_household_entitlements
WHERE household_id IN (
    '44000000-0000-4000-9000-000000000001',
    '44000000-0000-4000-9000-000000000002'
);
DELETE FROM entitlement_grants
WHERE billing_account_id IN (
    '44000000-0000-4000-b000-000000000001',
    '44000000-0000-4000-b000-000000000002',
    '44000000-0000-4000-b000-000000000003'
);
DELETE FROM billing_subscriptions
WHERE billing_account_id IN (
    '44000000-0000-4000-b000-000000000001',
    '44000000-0000-4000-b000-000000000002',
    '44000000-0000-4000-b000-000000000003'
);

SELECT public.rebuild_billing_entitlements(NULL);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        (
            SELECT * FROM expected_replay_subscriptions
            EXCEPT
            SELECT
                provider,
                environment,
                provider_subscription_id,
                provider_subscription_item_id,
                logical_product,
                tier,
                quantity,
                lifecycle,
                bound_household_id,
                historical_family_household_id,
                current_period_end,
                grace_end,
                terminal_at,
                last_effective_at,
                last_provider_order,
                last_event_precedence,
                last_provider_event_id
            FROM billing_subscriptions
            WHERE billing_account_id IN (
                '44000000-0000-4000-b000-000000000001',
                '44000000-0000-4000-b000-000000000002',
                '44000000-0000-4000-b000-000000000003'
            )
        )
        UNION ALL
        (
            SELECT
                provider,
                environment,
                provider_subscription_id,
                provider_subscription_item_id,
                logical_product,
                tier,
                quantity,
                lifecycle,
                bound_household_id,
                historical_family_household_id,
                current_period_end,
                grace_end,
                terminal_at,
                last_effective_at,
                last_provider_order,
                last_event_precedence,
                last_provider_event_id
            FROM billing_subscriptions
            WHERE billing_account_id IN (
                '44000000-0000-4000-b000-000000000001',
                '44000000-0000-4000-b000-000000000002',
                '44000000-0000-4000-b000-000000000003'
            )
            EXCEPT
            SELECT * FROM expected_replay_subscriptions
        )
    ),
    'clean replay must reconstruct equivalent subscription state'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        (
            SELECT * FROM expected_replay_grants
            EXCEPT
            SELECT
                s.provider_subscription_id,
                s.provider_subscription_item_id,
                g.billing_account_id,
                g.grant_type,
                g.beneficiary_user_id,
                g.beneficiary_household_id,
                g.tier,
                g.quantity,
                g.effective_at,
                g.expires_at
            FROM entitlement_grants g
            JOIN billing_subscriptions s ON s.id = g.subscription_id
            WHERE g.billing_account_id IN (
                '44000000-0000-4000-b000-000000000001',
                '44000000-0000-4000-b000-000000000002',
                '44000000-0000-4000-b000-000000000003'
            )
              AND g.revoked_at IS NULL
        )
        UNION ALL
        (
            SELECT
                s.provider_subscription_id,
                s.provider_subscription_item_id,
                g.billing_account_id,
                g.grant_type,
                g.beneficiary_user_id,
                g.beneficiary_household_id,
                g.tier,
                g.quantity,
                g.effective_at,
                g.expires_at
            FROM entitlement_grants g
            JOIN billing_subscriptions s ON s.id = g.subscription_id
            WHERE g.billing_account_id IN (
                '44000000-0000-4000-b000-000000000001',
                '44000000-0000-4000-b000-000000000002',
                '44000000-0000-4000-b000-000000000003'
            )
              AND g.revoked_at IS NULL
            EXCEPT
            SELECT * FROM expected_replay_grants
        )
    ),
    'clean replay must reconstruct equivalent active grants'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        (SELECT * FROM expected_replay_users
         EXCEPT
         SELECT user_id, display_tier, expires_at
         FROM current_user_entitlements
         WHERE user_id IN (
             '44000000-0000-4000-8000-000000000001',
             '44000000-0000-4000-8000-000000000002',
             '44000000-0000-4000-8000-000000000003'
         ))
        UNION ALL
        (SELECT user_id, display_tier, expires_at
         FROM current_user_entitlements
         WHERE user_id IN (
             '44000000-0000-4000-8000-000000000001',
             '44000000-0000-4000-8000-000000000002',
             '44000000-0000-4000-8000-000000000003'
         )
         EXCEPT
         SELECT * FROM expected_replay_users)
    ),
    'clean replay must reconstruct equivalent user projections'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        (SELECT * FROM expected_replay_households
         EXCEPT
         SELECT
             household_id,
             display_tier,
             is_premium_sponsored,
             bank_connection_allowance,
             expires_at
         FROM current_household_entitlements
         WHERE household_id IN (
             '44000000-0000-4000-9000-000000000001',
             '44000000-0000-4000-9000-000000000002'
         ))
        UNION ALL
        (SELECT
             household_id,
             display_tier,
             is_premium_sponsored,
             bank_connection_allowance,
             expires_at
         FROM current_household_entitlements
         WHERE household_id IN (
             '44000000-0000-4000-9000-000000000001',
             '44000000-0000-4000-9000-000000000002'
         )
         EXCEPT
         SELECT * FROM expected_replay_households)
    ),
    'clean replay must reconstruct equivalent household projections'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        (SELECT * FROM expected_replay_evidence
         EXCEPT
         SELECT
             id,
             provider,
             environment,
             provider_event_id,
             provider_subscription_id,
             provider_subscription_item_id,
             effective_at,
             provider_order,
             event_type,
             normalized_lifecycle,
             normalized_logical_product,
             normalized_tier,
             normalized_quantity,
             normalized_bound_household_id,
             trusted_reactivation
         FROM billing_provider_events
         WHERE billing_account_id IN (
             '44000000-0000-4000-b000-000000000001',
             '44000000-0000-4000-b000-000000000002',
             '44000000-0000-4000-b000-000000000003'
         ))
        UNION ALL
        (SELECT
             id,
             provider,
             environment,
             provider_event_id,
             provider_subscription_id,
             provider_subscription_item_id,
             effective_at,
             provider_order,
             event_type,
             normalized_lifecycle,
             normalized_logical_product,
             normalized_tier,
             normalized_quantity,
             normalized_bound_household_id,
             trusted_reactivation
         FROM billing_provider_events
         WHERE billing_account_id IN (
             '44000000-0000-4000-b000-000000000001',
             '44000000-0000-4000-b000-000000000002',
             '44000000-0000-4000-b000-000000000003'
         )
         EXCEPT
         SELECT * FROM expected_replay_evidence)
    ),
    'clean replay must preserve immutable provider evidence exactly'
);

-- ---------------------------------------------------------------------------
-- Derived deletion semantics and retained pseudonymized evidence
-- ---------------------------------------------------------------------------

DELETE FROM family_plan_subscriptions
WHERE id = '44000000-0000-4000-d000-000000000001';

DELETE FROM household_members
WHERE household_id = '44000000-0000-4000-9000-000000000001';

DELETE FROM households
WHERE id = '44000000-0000-4000-9000-000000000001';

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE beneficiary_household_id = '44000000-0000-4000-9000-000000000001'
    )
    AND EXISTS (
        SELECT 1
        FROM billing_subscriptions
        WHERE provider_subscription_id = 'sub_family_1'
          AND bound_household_id = '44000000-0000-4000-9000-000000000001'
    ),
    'household beneficiary grants must cascade while immutable billing evidence remains'
);

DELETE FROM users
WHERE id = '44000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
    (
        SELECT owner_id IS NULL AND pseudonymized_at IS NOT NULL
        FROM billing_accounts
        WHERE id = '44000000-0000-4000-b000-000000000001'
    )
    AND EXISTS (
        SELECT 1
        FROM billing_provider_events
        WHERE billing_account_id = '44000000-0000-4000-b000-000000000001'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE beneficiary_user_id = '44000000-0000-4000-8000-000000000001'
    ),
    'user grants/projection must cascade while purchaser evidence is pseudonymized and retained'
);

-- RevenueCat Family terminal evidence is isolated after the foundation suite
-- because retained immutable subscriptions intentionally outlive users and
-- households.
INSERT INTO users (id, email, display_name)
VALUES (
    '44010000-0000-4000-8000-000000000005',
    'billing-rc-family@example.invalid',
    'Billing RevenueCat Family'
);
INSERT INTO households (id, name, created_by)
VALUES (
    '44010000-0000-4000-9000-000000000005',
    'Billing RevenueCat Household',
    '44010000-0000-4000-8000-000000000005'
);
INSERT INTO household_members (id, household_id, user_id, role)
VALUES (
    '44010000-0000-4000-a000-000000000005',
    '44010000-0000-4000-9000-000000000005',
    '44010000-0000-4000-8000-000000000005',
    'owner'
);
INSERT INTO billing_accounts (id, owner_id)
VALUES (
    '44010000-0000-4000-b000-000000000005',
    '44010000-0000-4000-8000-000000000005'
);
INSERT INTO billing_provider_identities (
    id,
    billing_account_id,
    provider,
    environment,
    provider_customer_id,
    is_primary
)
VALUES (
    '44010000-0000-4000-c000-000000000003',
    '44010000-0000-4000-b000-000000000005',
    'revenuecat',
    'sandbox',
    'rc_customer_family',
    true
);

SELECT pg_temp.assert_true(
    public.resolve_revenuecat_purchase_binding(
        '44010000-0000-4000-b000-000000000005',
        'sandbox',
        'rc_subscription_family_terminal',
        'store_original_family_terminal',
        ARRAY[
            'store_original_family_terminal',
            'store_renewal_family_terminal'
        ]
    ) = 'store_original_family_terminal',
    'RevenueCat Family history must resolve to its immutable purchase binding'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(public.record_billing_provider_event(
        '44010000-0000-4000-b000-000000000005',
        '44010000-0000-4000-c000-000000000003',
        'revenuecat',
        'sandbox',
        'rc_event_family_active',
        'store_original_family_terminal',
        NULL,
        statement_timestamp(),
        statement_timestamp() - interval '2 days',
        1,
        'activated',
        'active',
        'base_plan',
        'family',
        1,
        statement_timestamp() + interval '28 days',
        NULL,
        NULL,
        '44010000-0000-4000-9000-000000000005',
        false
    )),
    'RevenueCat Family evidence must apply through the canonical purchase binding'
);

SELECT pg_temp.assert_true(
    public.revenuecat_purchase_grants_access(
        '44010000-0000-4000-b000-000000000005',
        'sandbox',
        'store_original_family_terminal',
        NULL,
        '44010000-0000-4000-9000-000000000005'
    )
    AND public.find_revenuecat_family_binding(
        '44010000-0000-4000-b000-000000000005',
        'sandbox',
        NULL,
        'webhook_original_family_chargeback',
        ARRAY[
            'webhook_original_family_chargeback',
            'store_renewal_family_terminal'
        ]
    ) = '44010000-0000-4000-9000-000000000005',
    'Family authority lookup must resolve a distinct webhook original through a renewal alias'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(public.record_billing_provider_event(
        '44010000-0000-4000-b000-000000000005',
        '44010000-0000-4000-c000-000000000003',
        'revenuecat',
        'sandbox',
        'rc_event_family_chargeback',
        'store_original_family_terminal',
        NULL,
        statement_timestamp(),
        statement_timestamp() - interval '1 day',
        2,
        'chargeback',
        'chargeback',
        'base_plan',
        'family',
        1,
        NULL,
        NULL,
        statement_timestamp() - interval '1 day',
        '44010000-0000-4000-9000-000000000005',
        false
    )),
    'RevenueCat Family chargeback must revoke the canonical subscription immediately'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
           AND bool_and(lifecycle = 'chargeback')
           AND bool_and(historical_family_household_id =
               '44010000-0000-4000-9000-000000000005')
        FROM billing_subscriptions
        WHERE provider = 'revenuecat'
          AND environment = 'sandbox'
          AND provider_subscription_id = 'store_original_family_terminal'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '44010000-0000-4000-b000-000000000005'
          AND source_event_id = (
              SELECT id
              FROM billing_provider_events
              WHERE provider_event_id = 'rc_event_family_chargeback'
          )
          AND revoked_at IS NULL
    )
    AND NOT public.revenuecat_purchase_grants_access(
        '44010000-0000-4000-b000-000000000005',
        'sandbox',
        'store_original_family_terminal',
        NULL,
        '44010000-0000-4000-9000-000000000005'
    ),
    'RevenueCat terminal evidence must retain one Family subscription and revoke access'
);

SELECT pg_temp.assert_true(
    public.resolve_revenuecat_purchase_binding(
        '44010000-0000-4000-b000-000000000005',
        'sandbox',
        'rc_subscription_family_refund',
        'store_original_family_refund',
        ARRAY[
            'store_original_family_refund',
            'store_renewal_family_refund'
        ]
    ) = 'store_original_family_refund',
    'second Family purchase must establish reconciliation aliases'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(public.record_billing_provider_event(
        '44010000-0000-4000-b000-000000000005',
        '44010000-0000-4000-c000-000000000003',
        'revenuecat',
        'sandbox',
        'rc_event_family_refund_active',
        'store_original_family_refund',
        NULL,
        statement_timestamp(),
        statement_timestamp() - interval '2 days',
        1,
        'activated',
        'active',
        'base_plan',
        'family',
        1,
        statement_timestamp() + interval '28 days',
        NULL,
        NULL,
        '44010000-0000-4000-9000-000000000005',
        false
    )),
    'second RevenueCat Family purchase must grant before refund'
);

SELECT pg_temp.assert_true(
    public.find_revenuecat_family_binding(
        '44010000-0000-4000-b000-000000000005',
        'sandbox',
        NULL,
        'webhook_original_family_refund',
        ARRAY[
            'webhook_original_family_refund',
            'store_renewal_family_refund'
        ]
    ) = '44010000-0000-4000-9000-000000000005',
    'Family refund lookup must recover the immutable household through aliases'
);

SELECT pg_temp.assert_true(
    public.apply_billing_provider_event(public.record_billing_provider_event(
        '44010000-0000-4000-b000-000000000005',
        '44010000-0000-4000-c000-000000000003',
        'revenuecat',
        'sandbox',
        'rc_event_family_refund',
        'store_original_family_refund',
        NULL,
        statement_timestamp(),
        statement_timestamp() - interval '1 day',
        2,
        'refunded',
        'refunded',
        'base_plan',
        'family',
        1,
        NULL,
        NULL,
        statement_timestamp() - interval '1 day',
        '44010000-0000-4000-9000-000000000005',
        false
    )),
    'RevenueCat Family refund must revoke the aliased canonical subscription'
);

SELECT pg_temp.assert_true(
    NOT public.revenuecat_purchase_grants_access(
        '44010000-0000-4000-b000-000000000005',
        'sandbox',
        'store_original_family_refund',
        NULL,
        '44010000-0000-4000-9000-000000000005'
    ),
    'Family refund must immediately revoke the exact purchase grant'
);

ROLLBACK;
