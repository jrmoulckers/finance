-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260906000002_revenuecat_purchase_aliases
-- Description: Immutable RevenueCat subscription and store-transaction aliases
-- Issue: #4401
--
-- RevenueCat's v2 subscription ID is stable, while the store subscription
-- identifier can advance on each renewal. Webhooks identify the same purchase
-- by the store's immutable original transaction ID. This server-only mapping
-- binds those documented provider relationships to one existing immutable
-- billing_provider_purchase_bindings row.

CREATE TABLE billing_provider_purchase_aliases (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_binding_id   UUID        NOT NULL REFERENCES billing_provider_purchase_bindings(id) ON DELETE RESTRICT,
    provider              TEXT        NOT NULL,
    environment           TEXT        NOT NULL,
    alias_kind            TEXT        NOT NULL,
    provider_alias        TEXT        NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT billing_provider_purchase_aliases_provider_check
        CHECK (provider = 'revenuecat'),
    CONSTRAINT billing_provider_purchase_aliases_environment_check
        CHECK (environment IN ('sandbox', 'production')),
    CONSTRAINT billing_provider_purchase_aliases_kind_check
        CHECK (alias_kind IN ('revenuecat_subscription_id', 'store_transaction_id')),
    CONSTRAINT billing_provider_purchase_aliases_value_check
        CHECK (
            provider_alias = btrim(provider_alias)
            AND char_length(provider_alias) BETWEEN 1 AND 255
        ),
    CONSTRAINT billing_provider_purchase_aliases_alias_unique
        UNIQUE (provider, environment, alias_kind, provider_alias)
);

CREATE INDEX idx_billing_provider_purchase_aliases_binding
    ON billing_provider_purchase_aliases (purchase_binding_id);

CREATE FUNCTION public.protect_billing_provider_purchase_alias()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'billing provider purchase alias is immutable'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_billing_provider_purchase_alias_immutable
    BEFORE UPDATE OR DELETE ON billing_provider_purchase_aliases
    FOR EACH ROW EXECUTE FUNCTION public.protect_billing_provider_purchase_alias();

CREATE FUNCTION public.resolve_revenuecat_purchase_binding(
    p_billing_account_id UUID,
    p_environment TEXT,
    p_revenuecat_subscription_id TEXT,
    p_canonical_store_transaction_id TEXT,
    p_store_transaction_ids TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_alias RECORD;
    v_binding_ids UUID[];
    v_binding_id UUID;
    v_bound_account_id UUID;
    v_canonical_purchase_id TEXT;
BEGIN
    IF p_environment IS NULL
       OR p_environment NOT IN ('sandbox', 'production')
       OR (
           p_revenuecat_subscription_id IS NOT NULL
           AND (
               p_revenuecat_subscription_id <> btrim(p_revenuecat_subscription_id)
               OR char_length(p_revenuecat_subscription_id) NOT BETWEEN 1 AND 255
           )
       )
       OR p_canonical_store_transaction_id IS NULL
       OR p_canonical_store_transaction_id <> btrim(p_canonical_store_transaction_id)
       OR char_length(p_canonical_store_transaction_id) NOT BETWEEN 1 AND 255
       OR p_store_transaction_ids IS NULL
       OR cardinality(p_store_transaction_ids) = 0
       OR EXISTS (
           SELECT 1
           FROM unnest(p_store_transaction_ids) AS store_id
           WHERE store_id IS NULL
              OR store_id <> btrim(store_id)
              OR char_length(store_id) NOT BETWEEN 1 AND 255
       )
       OR NOT p_canonical_store_transaction_id = ANY(p_store_transaction_ids) THEN
        RAISE EXCEPTION 'invalid RevenueCat purchase aliases'
            USING ERRCODE = 'check_violation';
    END IF;

    IF lock_billing_accounts_internal(ARRAY[p_billing_account_id]) <> 1 THEN
        RAISE EXCEPTION 'billing account not found'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Account rows are always locked first. Alias locks are then acquired in a
    -- stable lexical order before the canonical purchase lock, preventing
    -- overlapping provider histories from deadlocking in opposite orders.
    FOR v_alias IN
        SELECT alias_kind, provider_alias
        FROM (
            SELECT
                'revenuecat_subscription_id'::TEXT AS alias_kind,
                p_revenuecat_subscription_id AS provider_alias
            WHERE p_revenuecat_subscription_id IS NOT NULL
            UNION
            SELECT
                'store_transaction_id'::TEXT,
                store_id
            FROM unnest(p_store_transaction_ids) AS store_id
        ) aliases
        ORDER BY alias_kind, provider_alias
    LOOP
        PERFORM pg_advisory_xact_lock(billing_purchase_lock_key(
            'revenuecat',
            p_environment,
            v_alias.alias_kind || ':' || v_alias.provider_alias,
            NULL
        ));
    END LOOP;

    PERFORM pg_advisory_xact_lock(billing_purchase_lock_key(
        'revenuecat',
        p_environment,
        p_canonical_store_transaction_id,
        NULL
    ));

    SELECT array_agg(DISTINCT purchase_binding_id ORDER BY purchase_binding_id)
    INTO v_binding_ids
    FROM billing_provider_purchase_aliases
    WHERE provider = 'revenuecat'
      AND environment = p_environment
      AND (
          (
              alias_kind = 'revenuecat_subscription_id'
              AND provider_alias = p_revenuecat_subscription_id
          )
          OR (
              alias_kind = 'store_transaction_id'
              AND provider_alias = ANY(p_store_transaction_ids)
          )
      );

    IF cardinality(v_binding_ids) > 1 THEN
        RAISE EXCEPTION 'RevenueCat purchase aliases resolve to conflicting bindings'
            USING ERRCODE = 'check_violation';
    END IF;

    v_binding_id := v_binding_ids[1];
    IF v_binding_id IS NULL THEN
        INSERT INTO billing_provider_purchase_bindings (
            billing_account_id,
            provider,
            environment,
            provider_subscription_id,
            provider_subscription_item_id
        )
        VALUES (
            p_billing_account_id,
            'revenuecat',
            p_environment,
            p_canonical_store_transaction_id,
            NULL
        )
        ON CONFLICT ON CONSTRAINT
            billing_provider_purchase_bindings_purchase_unique
        DO NOTHING
        RETURNING id INTO v_binding_id;

        IF v_binding_id IS NULL THEN
            SELECT id
            INTO v_binding_id
            FROM billing_provider_purchase_bindings
            WHERE provider = 'revenuecat'
              AND environment = p_environment
              AND provider_subscription_id = p_canonical_store_transaction_id
              AND provider_subscription_item_id IS NULL;
        END IF;
    END IF;

    SELECT billing_account_id, provider_subscription_id
    INTO v_bound_account_id, v_canonical_purchase_id
    FROM billing_provider_purchase_bindings
    WHERE id = v_binding_id;

    IF v_bound_account_id IS DISTINCT FROM p_billing_account_id THEN
        RAISE EXCEPTION 'RevenueCat purchase aliases conflict with immutable purchase binding'
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO billing_provider_purchase_aliases (
        purchase_binding_id,
        provider,
        environment,
        alias_kind,
        provider_alias
    )
    SELECT
        v_binding_id,
        'revenuecat',
        p_environment,
        alias_kind,
        provider_alias
    FROM (
        SELECT
            'revenuecat_subscription_id'::TEXT AS alias_kind,
            p_revenuecat_subscription_id AS provider_alias
        WHERE p_revenuecat_subscription_id IS NOT NULL
        UNION
        SELECT
            'store_transaction_id'::TEXT,
            store_id
        FROM unnest(p_store_transaction_ids) AS store_id
    ) aliases
    ON CONFLICT ON CONSTRAINT billing_provider_purchase_aliases_alias_unique
    DO NOTHING;

    IF EXISTS (
        SELECT 1
        FROM billing_provider_purchase_aliases
        WHERE provider = 'revenuecat'
          AND environment = p_environment
          AND (
              (
                  alias_kind = 'revenuecat_subscription_id'
                  AND provider_alias = p_revenuecat_subscription_id
              )
              OR (
                  alias_kind = 'store_transaction_id'
                  AND provider_alias = ANY(p_store_transaction_ids)
              )
          )
          AND purchase_binding_id <> v_binding_id
    ) THEN
        RAISE EXCEPTION 'RevenueCat purchase alias is already bound to another purchase'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN v_canonical_purchase_id;
END;
$$;

CREATE FUNCTION public.find_revenuecat_family_binding(
    p_billing_account_id UUID,
    p_environment TEXT,
    p_revenuecat_subscription_id TEXT,
    p_canonical_store_transaction_id TEXT,
    p_store_transaction_ids TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_canonical_purchase_id TEXT;
    v_historical_household_id UUID;
BEGIN
    v_canonical_purchase_id := public.resolve_revenuecat_purchase_binding(
        p_billing_account_id,
        p_environment,
        p_revenuecat_subscription_id,
        p_canonical_store_transaction_id,
        p_store_transaction_ids
    );

    SELECT s.historical_family_household_id
    INTO v_historical_household_id
    FROM billing_provider_purchase_bindings b
    JOIN billing_subscriptions s
      ON s.billing_account_id = b.billing_account_id
     AND s.provider = b.provider
     AND s.environment = b.environment
     AND s.provider_subscription_id = b.provider_subscription_id
     AND s.provider_subscription_item_id IS NOT DISTINCT FROM
         b.provider_subscription_item_id
    WHERE b.billing_account_id = p_billing_account_id
      AND b.provider = 'revenuecat'
      AND b.environment = p_environment
      AND b.provider_subscription_id = v_canonical_purchase_id
      AND b.provider_subscription_item_id IS NULL;

    RETURN v_historical_household_id;
END;
$$;

CREATE FUNCTION public.revenuecat_purchase_grants_access(
    p_billing_account_id UUID,
    p_environment TEXT,
    p_canonical_store_transaction_id TEXT,
    p_beneficiary_user_id UUID,
    p_beneficiary_household_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (p_beneficiary_user_id IS NULL) =
       (p_beneficiary_household_id IS NULL) THEN
        RAISE EXCEPTION 'exactly one RevenueCat beneficiary is required'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM billing_provider_purchase_bindings b
        JOIN billing_subscriptions s
          ON s.billing_account_id = b.billing_account_id
         AND s.provider = b.provider
         AND s.environment = b.environment
         AND s.provider_subscription_id = b.provider_subscription_id
         AND s.provider_subscription_item_id IS NOT DISTINCT FROM
             b.provider_subscription_item_id
        JOIN entitlement_grants g
          ON g.subscription_id = s.id
        JOIN billing_accounts a
          ON a.id = b.billing_account_id
        WHERE b.billing_account_id = p_billing_account_id
          AND b.provider = 'revenuecat'
          AND b.environment = p_environment
          AND b.provider_subscription_id = p_canonical_store_transaction_id
          AND b.provider_subscription_item_id IS NULL
          AND g.revoked_at IS NULL
          AND g.expires_at > statement_timestamp()
          AND (
              (
                  p_beneficiary_user_id IS NOT NULL
                  AND a.owner_id = p_beneficiary_user_id
                  AND g.beneficiary_user_id = p_beneficiary_user_id
              )
              OR (
                  p_beneficiary_household_id IS NOT NULL
                  AND s.historical_family_household_id =
                      p_beneficiary_household_id
                  AND g.beneficiary_household_id =
                      p_beneficiary_household_id
              )
          )
    );
END;
$$;

ALTER TABLE billing_provider_purchase_aliases ENABLE ROW LEVEL SECURITY;

-- There are intentionally no authenticated policies. RevenueCat aliases are
-- provider evidence and are reachable only through this service-role RPC.
REVOKE ALL ON TABLE billing_provider_purchase_aliases
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE billing_provider_purchase_aliases
    TO service_role;

REVOKE EXECUTE ON FUNCTION public.protect_billing_provider_purchase_alias()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_revenuecat_purchase_binding(
    UUID, TEXT, TEXT, TEXT, TEXT[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_revenuecat_purchase_binding(
    UUID, TEXT, TEXT, TEXT, TEXT[]
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.find_revenuecat_family_binding(
    UUID, TEXT, TEXT, TEXT, TEXT[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_revenuecat_family_binding(
    UUID, TEXT, TEXT, TEXT, TEXT[]
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.revenuecat_purchase_grants_access(
    UUID, TEXT, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revenuecat_purchase_grants_access(
    UUID, TEXT, TEXT, UUID, UUID
) TO service_role;
