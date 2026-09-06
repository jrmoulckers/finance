-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260906000001_server_authoritative_entitlements
-- Description: Server-authoritative billing evidence and entitlement projections
-- Issue: #4400
-- Authority:
--   - docs/architecture/0027-server-authoritative-entitlements.md
--   - docs/business/pricing/subscription-entitlement-catalog.md
--
-- This is the expand/foundation stage. Provider adapters are not part of this
-- migration. They must normalize authenticated evidence before calling the
-- service-role-only record/apply functions below.
--
-- Operational characteristics:
--   - New ledger/projection tables are empty, so index and constraint creation
--     has no data-scan or backfill risk.
--   - Only short catalog locks are expected, including the deliberate removal
--     of authenticated policies from the non-authoritative legacy table.
--   - No legacy rows are backfilled because they are unverified client input.
--   - The down migration is for unshipped/local schemas only. Once real
--     evidence exists, disable adapters and forward-repair rather than destroy
--     retained evidence.

-- =============================================================================
-- Stable purchaser identity and server-only provider identities
-- =============================================================================

CREATE TABLE billing_accounts (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                        UUID        UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    premium_sponsored_household_id  UUID        REFERENCES households(id) ON DELETE SET NULL,
    sponsorship_updated_at          TIMESTAMPTZ,
    pseudonymized_at                TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT billing_accounts_pseudonymization_check CHECK (
        (owner_id IS NOT NULL AND pseudonymized_at IS NULL)
        OR owner_id IS NULL
    )
);

CREATE INDEX idx_billing_accounts_premium_household
    ON billing_accounts (premium_sponsored_household_id)
    WHERE premium_sponsored_household_id IS NOT NULL;

CREATE TABLE billing_provider_identities (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_account_id    UUID        NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    provider              TEXT        NOT NULL,
    environment           TEXT        NOT NULL,
    provider_customer_id  TEXT        NOT NULL,
    is_primary            BOOLEAN     NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT billing_provider_identities_provider_check
        CHECK (provider IN ('revenuecat', 'stripe')),
    CONSTRAINT billing_provider_identities_environment_check
        CHECK (environment IN ('sandbox', 'production')),
    CONSTRAINT billing_provider_identities_customer_id_check
        CHECK (
            provider_customer_id = btrim(provider_customer_id)
            AND char_length(provider_customer_id) BETWEEN 1 AND 255
        ),
    CONSTRAINT billing_provider_identities_provider_customer_unique
        UNIQUE (provider, environment, provider_customer_id)
);

CREATE INDEX idx_billing_provider_identities_account
    ON billing_provider_identities (billing_account_id);

CREATE UNIQUE INDEX idx_billing_provider_identities_one_primary
    ON billing_provider_identities (billing_account_id, provider, environment)
    WHERE is_primary;

CREATE TABLE billing_provider_purchase_bindings (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_account_id              UUID        NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    provider                        TEXT        NOT NULL,
    environment                     TEXT        NOT NULL,
    provider_subscription_id        TEXT        NOT NULL,
    provider_subscription_item_id   TEXT,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT billing_provider_purchase_bindings_provider_check
        CHECK (provider IN ('revenuecat', 'stripe')),
    CONSTRAINT billing_provider_purchase_bindings_environment_check
        CHECK (environment IN ('sandbox', 'production')),
    CONSTRAINT billing_provider_purchase_bindings_subscription_id_check
        CHECK (
            provider_subscription_id = btrim(provider_subscription_id)
            AND char_length(provider_subscription_id) BETWEEN 1 AND 255
        ),
    CONSTRAINT billing_provider_purchase_bindings_item_id_check
        CHECK (
            provider_subscription_item_id IS NULL
            OR (
                provider_subscription_item_id = btrim(provider_subscription_item_id)
                AND char_length(provider_subscription_item_id) BETWEEN 1 AND 255
            )
        ),
    CONSTRAINT billing_provider_purchase_bindings_purchase_unique
        UNIQUE NULLS NOT DISTINCT (
            provider,
            environment,
            provider_subscription_id,
            provider_subscription_item_id
        )
);

CREATE INDEX idx_billing_provider_purchase_bindings_account
    ON billing_provider_purchase_bindings (billing_account_id);

-- =============================================================================
-- Normalized subscriptions and append-oriented provider evidence
-- =============================================================================

CREATE TABLE billing_subscriptions (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_account_id              UUID        NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    provider_identity_id            UUID        NOT NULL REFERENCES billing_provider_identities(id) ON DELETE RESTRICT,
    provider                        TEXT        NOT NULL,
    environment                     TEXT        NOT NULL,
    provider_subscription_id        TEXT        NOT NULL,
    provider_subscription_item_id   TEXT,
    logical_product                 TEXT        NOT NULL,
    tier                            TEXT,
    quantity                        BIGINT      NOT NULL DEFAULT 1,
    lifecycle                       TEXT        NOT NULL,
    bound_household_id              UUID,
    historical_family_household_id  UUID,
    current_period_end              TIMESTAMPTZ,
    grace_end                       TIMESTAMPTZ,
    terminal_at                     TIMESTAMPTZ,
    last_effective_at               TIMESTAMPTZ NOT NULL,
    last_provider_order             BIGINT      NOT NULL DEFAULT 0,
    last_event_precedence           SMALLINT    NOT NULL DEFAULT 0,
    last_provider_event_id          TEXT        NOT NULL,
    last_event_id                   UUID,
    next_effective_at               TIMESTAMPTZ,
    next_event_id                   UUID,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT billing_subscriptions_provider_check
        CHECK (provider IN ('revenuecat', 'stripe')),
    CONSTRAINT billing_subscriptions_environment_check
        CHECK (environment IN ('sandbox', 'production')),
    CONSTRAINT billing_subscriptions_provider_subscription_id_check
        CHECK (
            provider_subscription_id = btrim(provider_subscription_id)
            AND char_length(provider_subscription_id) BETWEEN 1 AND 255
        ),
    CONSTRAINT billing_subscriptions_provider_item_id_check
        CHECK (
            provider_subscription_item_id IS NULL
            OR (
                provider_subscription_item_id = btrim(provider_subscription_item_id)
                AND char_length(provider_subscription_item_id) BETWEEN 1 AND 255
            )
        ),
    CONSTRAINT billing_subscriptions_last_event_id_check
        CHECK (
            last_provider_event_id = btrim(last_provider_event_id)
            AND char_length(last_provider_event_id) BETWEEN 1 AND 255
        ),
    CONSTRAINT billing_subscriptions_product_check
        CHECK (logical_product IN ('base_plan', 'premium_bank_addon')),
    CONSTRAINT billing_subscriptions_tier_and_quantity_check CHECK (
        (
            logical_product = 'base_plan'
            AND tier IN ('plus', 'premium', 'family')
            AND quantity = 1
        )
        OR (
            logical_product = 'premium_bank_addon'
            AND tier IS NULL
            AND provider_subscription_item_id IS NOT NULL
            AND quantity > 0
        )
    ),
    CONSTRAINT billing_subscriptions_family_binding_check CHECK (
        (
            logical_product = 'base_plan'
            AND tier = 'family'
            AND bound_household_id IS NOT NULL
            AND historical_family_household_id = bound_household_id
        )
        OR (
            NOT (logical_product = 'base_plan' AND tier = 'family')
            AND bound_household_id IS NULL
        )
    ),
    CONSTRAINT billing_subscriptions_lifecycle_check CHECK (
        lifecycle IN (
            'trialing',
            'active',
            'cancelled_paid_through',
            'past_due_grace',
            'paused_paid_through',
            'expired',
            'refunded',
            'chargeback'
        )
    ),
    CONSTRAINT billing_subscriptions_access_window_check CHECK (
        (
            lifecycle IN ('trialing', 'active', 'cancelled_paid_through', 'paused_paid_through')
            AND current_period_end IS NOT NULL
        )
        OR (
            lifecycle = 'past_due_grace'
            AND grace_end IS NOT NULL
        )
        OR lifecycle IN ('expired', 'refunded', 'chargeback')
    ),
    CONSTRAINT billing_subscriptions_terminal_time_check CHECK (
        (lifecycle IN ('expired', 'refunded', 'chargeback') AND terminal_at IS NOT NULL)
        OR (lifecycle NOT IN ('expired', 'refunded', 'chargeback') AND terminal_at IS NULL)
    ),
    CONSTRAINT billing_subscriptions_provider_purchase_unique
        UNIQUE NULLS NOT DISTINCT (
            provider,
            environment,
            provider_subscription_id,
            provider_subscription_item_id
        )
);

CREATE INDEX idx_billing_subscriptions_account_product
    ON billing_subscriptions (billing_account_id, logical_product, lifecycle);
CREATE INDEX idx_billing_subscriptions_family_binding
    ON billing_subscriptions (bound_household_id)
    WHERE bound_household_id IS NOT NULL;

CREATE TABLE billing_provider_events (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_account_id              UUID        NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    provider_identity_id            UUID        NOT NULL REFERENCES billing_provider_identities(id) ON DELETE RESTRICT,
    provider                        TEXT        NOT NULL,
    environment                     TEXT        NOT NULL,
    provider_event_id               TEXT        NOT NULL,
    provider_subscription_id        TEXT        NOT NULL,
    provider_subscription_item_id   TEXT,
    received_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_at                    TIMESTAMPTZ NOT NULL,
    provider_order                  BIGINT      NOT NULL DEFAULT 0,
    event_type                      TEXT        NOT NULL,
    normalized_lifecycle            TEXT        NOT NULL,
    normalized_logical_product      TEXT        NOT NULL,
    normalized_tier                 TEXT,
    normalized_quantity             BIGINT      NOT NULL DEFAULT 1,
    normalized_current_period_end   TIMESTAMPTZ,
    normalized_grace_end            TIMESTAMPTZ,
    normalized_terminal_at          TIMESTAMPTZ,
    normalized_bound_household_id   UUID,
    trusted_reactivation            BOOLEAN     NOT NULL DEFAULT false,
    processing_status               TEXT        NOT NULL DEFAULT 'pending',
    processing_reason               TEXT,
    processed_at                    TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT billing_provider_events_provider_check
        CHECK (provider IN ('revenuecat', 'stripe')),
    CONSTRAINT billing_provider_events_environment_check
        CHECK (environment IN ('sandbox', 'production')),
    CONSTRAINT billing_provider_events_event_id_check
        CHECK (
            provider_event_id = btrim(provider_event_id)
            AND char_length(provider_event_id) BETWEEN 1 AND 255
        ),
    CONSTRAINT billing_provider_events_subscription_id_check
        CHECK (
            provider_subscription_id = btrim(provider_subscription_id)
            AND char_length(provider_subscription_id) BETWEEN 1 AND 255
        ),
    CONSTRAINT billing_provider_events_item_id_check
        CHECK (
            provider_subscription_item_id IS NULL
            OR (
                provider_subscription_item_id = btrim(provider_subscription_item_id)
                AND char_length(provider_subscription_item_id) BETWEEN 1 AND 255
            )
        ),
    CONSTRAINT billing_provider_events_type_check CHECK (
        event_type IN (
            'trial_started',
            'activated',
            'renewed',
            'cancelled',
            'past_due',
            'paused',
            'expired',
            'refunded',
            'chargeback',
            'reactivated',
            'quantity_changed'
        )
    ),
    CONSTRAINT billing_provider_events_lifecycle_check CHECK (
        normalized_lifecycle IN (
            'trialing',
            'active',
            'cancelled_paid_through',
            'past_due_grace',
            'paused_paid_through',
            'expired',
            'refunded',
            'chargeback'
        )
    ),
    CONSTRAINT billing_provider_events_product_check
        CHECK (normalized_logical_product IN ('base_plan', 'premium_bank_addon')),
    CONSTRAINT billing_provider_events_tier_quantity_check CHECK (
        (
            normalized_logical_product = 'base_plan'
            AND normalized_tier IN ('plus', 'premium', 'family')
            AND normalized_quantity = 1
        )
        OR (
            normalized_logical_product = 'premium_bank_addon'
            AND normalized_tier IS NULL
            AND provider_subscription_item_id IS NOT NULL
            AND normalized_quantity > 0
        )
    ),
    CONSTRAINT billing_provider_events_family_binding_check CHECK (
        (
            normalized_logical_product = 'base_plan'
            AND normalized_tier = 'family'
            AND normalized_bound_household_id IS NOT NULL
        )
        OR (
            NOT (
                normalized_logical_product = 'base_plan'
                AND normalized_tier = 'family'
            )
            AND normalized_bound_household_id IS NULL
        )
    ),
    CONSTRAINT billing_provider_events_access_window_check CHECK (
        (
            normalized_lifecycle IN (
                'trialing',
                'active',
                'cancelled_paid_through',
                'paused_paid_through'
            )
            AND normalized_current_period_end IS NOT NULL
        )
        OR (
            normalized_lifecycle = 'past_due_grace'
            AND normalized_grace_end IS NOT NULL
        )
        OR normalized_lifecycle IN ('expired', 'refunded', 'chargeback')
    ),
    CONSTRAINT billing_provider_events_terminal_time_check CHECK (
        (
            normalized_lifecycle IN ('expired', 'refunded', 'chargeback')
            AND normalized_terminal_at IS NOT NULL
        )
        OR (
            normalized_lifecycle NOT IN ('expired', 'refunded', 'chargeback')
            AND normalized_terminal_at IS NULL
        )
    ),
    CONSTRAINT billing_provider_events_reactivation_check CHECK (
        NOT trusted_reactivation
        OR (
            event_type IN ('renewed', 'reactivated')
            AND normalized_lifecycle IN (
                'trialing',
                'active',
                'past_due_grace',
                'cancelled_paid_through',
                'paused_paid_through'
            )
        )
    ),
    CONSTRAINT billing_provider_events_processing_check
        CHECK (processing_status IN ('pending', 'scheduled', 'applied', 'stale', 'rejected', 'error')),
    CONSTRAINT billing_provider_events_reason_check
        CHECK (processing_reason IS NULL OR char_length(processing_reason) BETWEEN 1 AND 500),
    CONSTRAINT billing_provider_events_provider_event_unique
        UNIQUE (provider, environment, provider_event_id)
);

CREATE INDEX idx_billing_provider_events_purchase_order
    ON billing_provider_events (
        provider,
        environment,
        provider_subscription_id,
        provider_subscription_item_id,
        effective_at,
        provider_order
    );
CREATE INDEX idx_billing_provider_events_pending
    ON billing_provider_events (received_at, id)
    WHERE processing_status = 'pending';

ALTER TABLE billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_last_event_fk
    FOREIGN KEY (last_event_id) REFERENCES billing_provider_events(id) ON DELETE RESTRICT;
ALTER TABLE billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_next_event_fk
    FOREIGN KEY (next_event_id) REFERENCES billing_provider_events(id) ON DELETE RESTRICT;

-- =============================================================================
-- Derived grants and minimized projections
-- =============================================================================

CREATE TABLE entitlement_grants (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_account_id      UUID        NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    subscription_id         UUID        NOT NULL REFERENCES billing_subscriptions(id) ON DELETE RESTRICT,
    source_event_id         UUID        NOT NULL REFERENCES billing_provider_events(id) ON DELETE RESTRICT,
    grant_type              TEXT        NOT NULL,
    beneficiary_user_id     UUID        REFERENCES users(id) ON DELETE CASCADE,
    beneficiary_household_id UUID       REFERENCES households(id) ON DELETE CASCADE,
    tier                    TEXT,
    quantity                BIGINT      NOT NULL DEFAULT 0,
    effective_at            TIMESTAMPTZ NOT NULL,
    expires_at              TIMESTAMPTZ NOT NULL,
    revoked_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT entitlement_grants_type_check CHECK (
        grant_type IN (
            'direct_user',
            'family_household',
            'premium_sponsorship',
            'premium_addon'
        )
    ),
    CONSTRAINT entitlement_grants_one_beneficiary_check CHECK (
        (beneficiary_user_id IS NOT NULL)::INTEGER
        + (beneficiary_household_id IS NOT NULL)::INTEGER = 1
    ),
    CONSTRAINT entitlement_grants_scope_check CHECK (
        (
            grant_type = 'direct_user'
            AND beneficiary_user_id IS NOT NULL
            AND tier IN ('plus', 'premium')
            AND quantity = 0
        )
        OR (
            grant_type = 'family_household'
            AND beneficiary_household_id IS NOT NULL
            AND tier = 'family'
            AND quantity = 0
        )
        OR (
            grant_type = 'premium_sponsorship'
            AND beneficiary_household_id IS NOT NULL
            AND tier = 'premium'
            AND quantity = 0
        )
        OR (
            grant_type = 'premium_addon'
            AND beneficiary_household_id IS NOT NULL
            AND tier IS NULL
            AND quantity > 0
        )
    ),
    CONSTRAINT entitlement_grants_window_check CHECK (effective_at < expires_at)
);

CREATE UNIQUE INDEX idx_entitlement_grants_user_source
    ON entitlement_grants (subscription_id, grant_type, beneficiary_user_id)
    WHERE beneficiary_user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_entitlement_grants_household_source
    ON entitlement_grants (subscription_id, grant_type, beneficiary_household_id)
    WHERE beneficiary_household_id IS NOT NULL;
CREATE INDEX idx_entitlement_grants_active_user
    ON entitlement_grants (beneficiary_user_id, expires_at)
    WHERE revoked_at IS NULL AND beneficiary_user_id IS NOT NULL;
CREATE INDEX idx_entitlement_grants_active_household
    ON entitlement_grants (beneficiary_household_id, expires_at, billing_account_id)
    WHERE revoked_at IS NULL AND beneficiary_household_id IS NOT NULL;

CREATE TABLE current_user_entitlements (
    user_id                 UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_tier            TEXT        NOT NULL DEFAULT 'free',
    source_base_grant_id    UUID        REFERENCES entitlement_grants(id) ON DELETE SET NULL,
    effective_at            TIMESTAMPTZ NOT NULL,
    expires_at              TIMESTAMPTZ,
    projection_version      BIGINT      NOT NULL DEFAULT 1,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT current_user_entitlements_tier_check
        CHECK (display_tier IN ('free', 'plus', 'premium')),
    CONSTRAINT current_user_entitlements_source_check CHECK (
        (display_tier = 'free' AND source_base_grant_id IS NULL AND expires_at IS NULL)
        OR (display_tier <> 'free' AND source_base_grant_id IS NOT NULL AND expires_at IS NOT NULL)
    ),
    CONSTRAINT current_user_entitlements_version_check CHECK (projection_version > 0)
);

CREATE TABLE current_household_entitlements (
    household_id               UUID        PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
    display_tier               TEXT        NOT NULL DEFAULT 'free',
    is_premium_sponsored       BOOLEAN     NOT NULL DEFAULT false,
    bank_connection_allowance  BIGINT      NOT NULL DEFAULT 0,
    source_base_grant_id       UUID        REFERENCES entitlement_grants(id) ON DELETE SET NULL,
    effective_at               TIMESTAMPTZ NOT NULL,
    expires_at                 TIMESTAMPTZ,
    projection_version         BIGINT      NOT NULL DEFAULT 1,
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT current_household_entitlements_tier_check
        CHECK (display_tier IN ('free', 'premium', 'family')),
    CONSTRAINT current_household_entitlements_allowance_check
        CHECK (bank_connection_allowance >= 0),
    CONSTRAINT current_household_entitlements_source_check CHECK (
        (
            display_tier = 'free'
            AND source_base_grant_id IS NULL
            AND bank_connection_allowance = 0
            AND expires_at IS NULL
        )
        OR (
            display_tier <> 'free'
            AND source_base_grant_id IS NOT NULL
            AND bank_connection_allowance > 0
            AND expires_at IS NOT NULL
        )
    ),
    CONSTRAINT current_household_entitlements_sponsorship_check
        CHECK (is_premium_sponsored = (display_tier = 'premium')),
    CONSTRAINT current_household_entitlements_version_check CHECK (projection_version > 0)
);

-- =============================================================================
-- Immutability and timestamp triggers
-- =============================================================================

CREATE TRIGGER trg_billing_accounts_updated_at
    BEFORE UPDATE ON billing_accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_billing_provider_identities_updated_at
    BEFORE UPDATE ON billing_provider_identities
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_billing_subscriptions_updated_at
    BEFORE UPDATE ON billing_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_entitlement_grants_updated_at
    BEFORE UPDATE ON entitlement_grants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.pseudonymize_billing_account_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
        IF OLD.owner_id IS NOT NULL AND NEW.owner_id IS NULL THEN
            NEW.pseudonymized_at := COALESCE(NEW.pseudonymized_at, statement_timestamp());
            NEW.premium_sponsored_household_id := NULL;
            NEW.sponsorship_updated_at := statement_timestamp();
        ELSE
            RAISE EXCEPTION 'billing account ownership is immutable and purchases cannot transfer'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_account_owner_pseudonymized
    BEFORE UPDATE OF owner_id ON billing_accounts
    FOR EACH ROW EXECUTE FUNCTION public.pseudonymize_billing_account_owner();

CREATE FUNCTION public.protect_billing_provider_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.billing_account_id IS DISTINCT FROM NEW.billing_account_id
       OR OLD.provider IS DISTINCT FROM NEW.provider
       OR OLD.environment IS DISTINCT FROM NEW.environment
       OR OLD.provider_customer_id IS DISTINCT FROM NEW.provider_customer_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'billing provider identity evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_provider_identity_immutable
    BEFORE UPDATE ON billing_provider_identities
    FOR EACH ROW EXECUTE FUNCTION public.protect_billing_provider_identity();

CREATE FUNCTION public.protect_billing_provider_purchase_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'billing provider purchase binding is immutable'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_billing_provider_purchase_binding_immutable
    BEFORE UPDATE OR DELETE ON billing_provider_purchase_bindings
    FOR EACH ROW EXECUTE FUNCTION public.protect_billing_provider_purchase_binding();

CREATE FUNCTION public.protect_billing_subscription_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.billing_account_id IS DISTINCT FROM NEW.billing_account_id
       OR OLD.provider IS DISTINCT FROM NEW.provider
       OR OLD.environment IS DISTINCT FROM NEW.environment
       OR OLD.provider_subscription_id IS DISTINCT FROM NEW.provider_subscription_id
       OR OLD.provider_subscription_item_id IS DISTINCT FROM NEW.provider_subscription_item_id
       OR (
           OLD.historical_family_household_id IS NOT NULL
           AND NEW.historical_family_household_id IS DISTINCT FROM OLD.historical_family_household_id
       )
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'billing subscription purchase identity and historical Family binding are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_subscription_identity_immutable
    BEFORE UPDATE ON billing_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.protect_billing_subscription_identity();

CREATE FUNCTION public.protect_billing_provider_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'billing provider evidence is append-only'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.billing_account_id IS DISTINCT FROM NEW.billing_account_id
       OR OLD.provider_identity_id IS DISTINCT FROM NEW.provider_identity_id
       OR OLD.provider IS DISTINCT FROM NEW.provider
       OR OLD.environment IS DISTINCT FROM NEW.environment
       OR OLD.provider_event_id IS DISTINCT FROM NEW.provider_event_id
       OR OLD.provider_subscription_id IS DISTINCT FROM NEW.provider_subscription_id
       OR OLD.provider_subscription_item_id IS DISTINCT FROM NEW.provider_subscription_item_id
       OR OLD.received_at IS DISTINCT FROM NEW.received_at
       OR OLD.effective_at IS DISTINCT FROM NEW.effective_at
       OR OLD.provider_order IS DISTINCT FROM NEW.provider_order
       OR OLD.event_type IS DISTINCT FROM NEW.event_type
       OR OLD.normalized_lifecycle IS DISTINCT FROM NEW.normalized_lifecycle
       OR OLD.normalized_logical_product IS DISTINCT FROM NEW.normalized_logical_product
       OR OLD.normalized_tier IS DISTINCT FROM NEW.normalized_tier
       OR OLD.normalized_quantity IS DISTINCT FROM NEW.normalized_quantity
       OR OLD.normalized_current_period_end IS DISTINCT FROM NEW.normalized_current_period_end
       OR OLD.normalized_grace_end IS DISTINCT FROM NEW.normalized_grace_end
       OR OLD.normalized_terminal_at IS DISTINCT FROM NEW.normalized_terminal_at
       OR OLD.normalized_bound_household_id IS DISTINCT FROM NEW.normalized_bound_household_id
       OR OLD.trusted_reactivation IS DISTINCT FROM NEW.trusted_reactivation
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'billing provider evidence fields are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_provider_event_immutable
    BEFORE UPDATE OR DELETE ON billing_provider_events
    FOR EACH ROW EXECUTE FUNCTION public.protect_billing_provider_event();

-- =============================================================================
-- Deterministic ordering and projection helpers (not client-executable)
-- =============================================================================

CREATE FUNCTION public.billing_event_precedence(p_lifecycle TEXT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
    SELECT CASE p_lifecycle
        WHEN 'chargeback' THEN 80
        WHEN 'refunded' THEN 70
        WHEN 'expired' THEN 60
        WHEN 'paused_paid_through' THEN 50
        WHEN 'past_due_grace' THEN 40
        WHEN 'cancelled_paid_through' THEN 30
        WHEN 'active' THEN 20
        WHEN 'trialing' THEN 10
    END::SMALLINT;
$$;

CREATE FUNCTION public.billing_subscription_access_expires_at(
    p_lifecycle TEXT,
    p_current_period_end TIMESTAMPTZ,
    p_grace_end TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN p_lifecycle = 'past_due_grace' THEN p_grace_end
        WHEN p_lifecycle IN (
            'trialing',
            'active',
            'cancelled_paid_through',
            'paused_paid_through'
        ) THEN p_current_period_end
        ELSE NULL
    END;
$$;

CREATE FUNCTION public.billing_purchase_lock_key(
    p_provider TEXT,
    p_environment TEXT,
    p_provider_subscription_id TEXT,
    p_provider_subscription_item_id TEXT
)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT hashtextextended(
        p_provider
        || chr(31)
        || p_environment
        || chr(31)
        || p_provider_subscription_id
        || chr(31)
        || COALESCE(p_provider_subscription_item_id, '<no-item>'),
        4400
    );
$$;

-- Account rows are the first billing lock class. Callers that may touch more
-- than one account must pass the complete set so every row is acquired in the
-- same UUID order before purchase advisory locks or derived-state work.
CREATE FUNCTION public.lock_billing_accounts_internal(p_billing_account_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_locked_count INTEGER;
BEGIN
    PERFORM a.id
    FROM billing_accounts a
    WHERE a.id = ANY(COALESCE(p_billing_account_ids, ARRAY[]::UUID[]))
    ORDER BY a.id
    FOR UPDATE;

    GET DIAGNOSTICS v_locked_count = ROW_COUNT;
    RETURN v_locked_count;
END;
$$;

-- Reconstructs each mutable purchase snapshot from immutable normalized events.
-- Future-effective evidence remains scheduled until a rebuild at or after its
-- trusted effective time. Processing outcomes are recomputed deterministically
-- from event ordering and lifecycle transition rules.
CREATE FUNCTION public.replay_billing_account_subscriptions_internal(
    p_billing_account_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_as_of TIMESTAMPTZ := statement_timestamp();
    v_key RECORD;
    v_event billing_provider_events%ROWTYPE;
    v_has_state BOOLEAN;
    v_rejected_reason TEXT;
    v_provider_identity_id UUID;
    v_logical_product TEXT;
    v_tier TEXT;
    v_quantity BIGINT;
    v_lifecycle TEXT;
    v_bound_household_id UUID;
    v_historical_family_household_id UUID;
    v_current_period_end TIMESTAMPTZ;
    v_grace_end TIMESTAMPTZ;
    v_terminal_at TIMESTAMPTZ;
    v_last_effective_at TIMESTAMPTZ;
    v_last_provider_order BIGINT;
    v_last_precedence SMALLINT;
    v_last_provider_event_id TEXT;
    v_last_event_id UUID;
    v_precedence SMALLINT;
    v_next_effective_at TIMESTAMPTZ;
    v_next_event_id UUID;
BEGIN
    PERFORM 1
    FROM billing_accounts
    WHERE id = p_billing_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing account not found'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    UPDATE billing_provider_events
    SET processing_status = 'scheduled',
        processing_reason = 'trusted effective time has not arrived',
        processed_at = NULL
    WHERE billing_account_id = p_billing_account_id
      AND effective_at > v_as_of
      AND processing_status IS DISTINCT FROM 'scheduled'
      AND EXISTS (
          SELECT 1
          FROM billing_provider_purchase_bindings b
          WHERE b.billing_account_id = p_billing_account_id
            AND b.provider = billing_provider_events.provider
            AND b.environment = billing_provider_events.environment
            AND b.provider_subscription_id =
                billing_provider_events.provider_subscription_id
            AND b.provider_subscription_item_id IS NOT DISTINCT FROM
                billing_provider_events.provider_subscription_item_id
      );

    FOR v_key IN
        SELECT
            provider,
            environment,
            provider_subscription_id,
            provider_subscription_item_id
        FROM billing_provider_events e
        WHERE e.billing_account_id = p_billing_account_id
          AND EXISTS (
              SELECT 1
              FROM billing_provider_purchase_bindings b
              WHERE b.billing_account_id = p_billing_account_id
                AND b.provider = e.provider
                AND b.environment = e.environment
                AND b.provider_subscription_id = e.provider_subscription_id
                AND b.provider_subscription_item_id IS NOT DISTINCT FROM
                    e.provider_subscription_item_id
          )
        GROUP BY
            provider,
            environment,
            provider_subscription_id,
            provider_subscription_item_id
        ORDER BY
            provider,
            environment,
            provider_subscription_id,
            provider_subscription_item_id NULLS FIRST
    LOOP
        PERFORM pg_advisory_xact_lock(billing_purchase_lock_key(
            v_key.provider,
            v_key.environment,
            v_key.provider_subscription_id,
            v_key.provider_subscription_item_id
        ));

        v_has_state := false;
        v_provider_identity_id := NULL;
        v_logical_product := NULL;
        v_tier := NULL;
        v_quantity := NULL;
        v_lifecycle := NULL;
        v_bound_household_id := NULL;
        v_historical_family_household_id := NULL;
        v_current_period_end := NULL;
        v_grace_end := NULL;
        v_terminal_at := NULL;
        v_last_effective_at := NULL;
        v_last_provider_order := NULL;
        v_last_precedence := NULL;
        v_last_provider_event_id := NULL;
        v_last_event_id := NULL;
        v_next_effective_at := NULL;
        v_next_event_id := NULL;

        FOR v_event IN
            SELECT *
            FROM billing_provider_events
            WHERE billing_account_id = p_billing_account_id
              AND provider = v_key.provider
              AND environment = v_key.environment
              AND provider_subscription_id = v_key.provider_subscription_id
              AND provider_subscription_item_id IS NOT DISTINCT FROM
                  v_key.provider_subscription_item_id
              AND effective_at <= v_as_of
            ORDER BY
                effective_at,
                provider_order,
                billing_event_precedence(normalized_lifecycle),
                provider_event_id
        LOOP
            v_precedence := billing_event_precedence(v_event.normalized_lifecycle);
            v_rejected_reason := NULL;

            IF EXISTS (
                SELECT 1
                FROM billing_provider_events peer
                WHERE peer.billing_account_id = p_billing_account_id
                  AND peer.provider = v_event.provider
                  AND peer.environment = v_event.environment
                  AND peer.provider_subscription_id =
                      v_event.provider_subscription_id
                  AND peer.provider_subscription_item_id IS NOT DISTINCT FROM
                      v_event.provider_subscription_item_id
                  AND peer.effective_at = v_event.effective_at
                  AND peer.provider_order = v_event.provider_order
                  AND peer.effective_at <= v_as_of
                  AND (
                      billing_event_precedence(peer.normalized_lifecycle),
                      peer.provider_event_id
                  ) > (
                      v_precedence,
                      v_event.provider_event_id
                  )
            ) THEN
                UPDATE billing_provider_events
                SET processing_status = 'stale',
                    processing_reason =
                        'equal-time evidence lost deterministic precedence',
                    processed_at = v_as_of
                WHERE id = v_event.id;
                CONTINUE;
            ELSIF v_has_state
               AND v_lifecycle IN ('refunded', 'chargeback') THEN
                v_rejected_reason :=
                    'refund and chargeback evidence is irreversible for this purchase';
            ELSIF v_has_state
               AND (
                   v_event.effective_at,
                   v_event.provider_order,
                   v_precedence,
                   v_event.provider_event_id
               ) <= (
                   v_last_effective_at,
                   v_last_provider_order,
                   v_last_precedence,
                   v_last_provider_event_id
               ) THEN
                UPDATE billing_provider_events
                SET processing_status = 'stale',
                    processing_reason =
                        'event ordering does not supersede current purchase evidence',
                    processed_at = v_as_of
                WHERE id = v_event.id;
                CONTINUE;
            ELSIF v_has_state
               AND v_lifecycle = 'expired'
               AND v_event.normalized_lifecycle IN (
                   'trialing',
                   'active',
                   'past_due_grace',
                   'cancelled_paid_through',
                   'paused_paid_through'
               )
               AND (
                   NOT v_event.trusted_reactivation
                   OR v_event.event_type NOT IN ('renewed', 'reactivated')
                   OR v_event.provider_order <= v_last_provider_order
               ) THEN
                v_rejected_reason :=
                    'expiry requires a strictly newer trusted renewal or reactivation';
            ELSIF v_event.normalized_logical_product = 'base_plan'
               AND v_event.normalized_tier = 'family'
               AND v_historical_family_household_id IS NOT NULL
               AND v_event.normalized_bound_household_id IS DISTINCT FROM
                   v_historical_family_household_id THEN
                v_rejected_reason :=
                    'Family purchase evidence cannot transfer to another household';
            END IF;

            IF v_rejected_reason IS NOT NULL THEN
                UPDATE billing_provider_events
                SET processing_status = 'rejected',
                    processing_reason = v_rejected_reason,
                    processed_at = v_as_of
                WHERE id = v_event.id;
                CONTINUE;
            END IF;

            IF v_event.normalized_logical_product = 'base_plan'
               AND v_event.normalized_tier = 'family'
               AND v_historical_family_household_id IS NULL THEN
                v_historical_family_household_id :=
                    v_event.normalized_bound_household_id;
            END IF;

            v_has_state := true;
            v_provider_identity_id := v_event.provider_identity_id;
            v_logical_product := v_event.normalized_logical_product;
            v_tier := v_event.normalized_tier;
            v_quantity := v_event.normalized_quantity;
            v_lifecycle := v_event.normalized_lifecycle;
            v_bound_household_id := v_event.normalized_bound_household_id;
            v_current_period_end := v_event.normalized_current_period_end;
            v_grace_end := v_event.normalized_grace_end;
            v_terminal_at := v_event.normalized_terminal_at;
            v_last_effective_at := v_event.effective_at;
            v_last_provider_order := v_event.provider_order;
            v_last_precedence := v_precedence;
            v_last_provider_event_id := v_event.provider_event_id;
            v_last_event_id := v_event.id;

            UPDATE billing_provider_events
            SET processing_status = 'applied',
                processing_reason = 'included in deterministic purchase replay',
                processed_at = v_as_of
            WHERE id = v_event.id;
        END LOOP;

        IF v_has_state THEN
            INSERT INTO billing_subscriptions (
                billing_account_id,
                provider_identity_id,
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
                last_provider_event_id,
                last_event_id
            )
            VALUES (
                p_billing_account_id,
                v_provider_identity_id,
                v_key.provider,
                v_key.environment,
                v_key.provider_subscription_id,
                v_key.provider_subscription_item_id,
                v_logical_product,
                v_tier,
                v_quantity,
                v_lifecycle,
                v_bound_household_id,
                v_historical_family_household_id,
                v_current_period_end,
                v_grace_end,
                v_terminal_at,
                v_last_effective_at,
                v_last_provider_order,
                v_last_precedence,
                v_last_provider_event_id,
                v_last_event_id
            )
            ON CONFLICT ON CONSTRAINT billing_subscriptions_provider_purchase_unique
            DO UPDATE SET
                billing_account_id = EXCLUDED.billing_account_id,
                provider_identity_id = EXCLUDED.provider_identity_id,
                logical_product = EXCLUDED.logical_product,
                tier = EXCLUDED.tier,
                quantity = EXCLUDED.quantity,
                lifecycle = EXCLUDED.lifecycle,
                bound_household_id = EXCLUDED.bound_household_id,
                historical_family_household_id =
                    EXCLUDED.historical_family_household_id,
                current_period_end = EXCLUDED.current_period_end,
                grace_end = EXCLUDED.grace_end,
                terminal_at = EXCLUDED.terminal_at,
                last_effective_at = EXCLUDED.last_effective_at,
                last_provider_order = EXCLUDED.last_provider_order,
                last_event_precedence = EXCLUDED.last_event_precedence,
                last_provider_event_id = EXCLUDED.last_provider_event_id,
                last_event_id = EXCLUDED.last_event_id;

            FOR v_event IN
                SELECT *
                FROM billing_provider_events
                WHERE billing_account_id = p_billing_account_id
                  AND provider = v_key.provider
                  AND environment = v_key.environment
                  AND provider_subscription_id =
                      v_key.provider_subscription_id
                  AND provider_subscription_item_id IS NOT DISTINCT FROM
                      v_key.provider_subscription_item_id
                  AND effective_at > v_as_of
                ORDER BY
                    effective_at,
                    provider_order,
                    billing_event_precedence(normalized_lifecycle),
                    provider_event_id
            LOOP
                v_precedence :=
                    billing_event_precedence(v_event.normalized_lifecycle);
                v_rejected_reason := NULL;

                IF EXISTS (
                    SELECT 1
                    FROM billing_provider_events peer
                    WHERE peer.billing_account_id = p_billing_account_id
                      AND peer.provider = v_event.provider
                      AND peer.environment = v_event.environment
                      AND peer.provider_subscription_id =
                          v_event.provider_subscription_id
                      AND peer.provider_subscription_item_id IS NOT DISTINCT FROM
                          v_event.provider_subscription_item_id
                      AND peer.effective_at = v_event.effective_at
                      AND peer.provider_order = v_event.provider_order
                      AND (
                          billing_event_precedence(peer.normalized_lifecycle),
                          peer.provider_event_id
                      ) > (
                          v_precedence,
                          v_event.provider_event_id
                      )
                ) THEN
                    UPDATE billing_provider_events
                    SET processing_status = 'stale',
                        processing_reason =
                            'equal-time evidence lost deterministic precedence',
                        processed_at = v_as_of
                    WHERE id = v_event.id;
                    CONTINUE;
                ELSIF v_lifecycle IN ('refunded', 'chargeback') THEN
                    v_rejected_reason :=
                        'refund and chargeback evidence is irreversible for this purchase';
                ELSIF (
                    v_event.effective_at,
                    v_event.provider_order,
                    v_precedence,
                    v_event.provider_event_id
                ) <= (
                    v_last_effective_at,
                    v_last_provider_order,
                    v_last_precedence,
                    v_last_provider_event_id
                ) THEN
                    UPDATE billing_provider_events
                    SET processing_status = 'stale',
                        processing_reason =
                            'event ordering does not supersede current purchase evidence',
                        processed_at = v_as_of
                    WHERE id = v_event.id;
                    CONTINUE;
                ELSIF v_lifecycle = 'expired'
                   AND v_event.normalized_lifecycle IN (
                       'trialing',
                       'active',
                       'past_due_grace',
                       'cancelled_paid_through',
                       'paused_paid_through'
                   )
                   AND (
                       NOT v_event.trusted_reactivation
                       OR v_event.event_type NOT IN ('renewed', 'reactivated')
                       OR v_event.provider_order <= v_last_provider_order
                   ) THEN
                    v_rejected_reason :=
                        'expiry requires a strictly newer trusted renewal or reactivation';
                ELSIF v_event.normalized_logical_product = 'base_plan'
                   AND v_event.normalized_tier = 'family'
                   AND v_historical_family_household_id IS NOT NULL
                   AND v_event.normalized_bound_household_id IS DISTINCT FROM
                       v_historical_family_household_id THEN
                    v_rejected_reason :=
                        'Family purchase evidence cannot transfer to another household';
                END IF;

                IF v_rejected_reason IS NOT NULL THEN
                    UPDATE billing_provider_events
                    SET processing_status = 'rejected',
                        processing_reason = v_rejected_reason,
                        processed_at = v_as_of
                    WHERE id = v_event.id;
                    CONTINUE;
                END IF;

                IF v_next_effective_at IS NULL THEN
                    v_next_effective_at := v_event.effective_at;
                    v_next_event_id := v_event.id;
                END IF;

                IF v_event.normalized_logical_product = 'base_plan'
                   AND v_event.normalized_tier = 'family'
                   AND v_historical_family_household_id IS NULL THEN
                    v_historical_family_household_id :=
                        v_event.normalized_bound_household_id;
                END IF;

                v_provider_identity_id := v_event.provider_identity_id;
                v_logical_product := v_event.normalized_logical_product;
                v_tier := v_event.normalized_tier;
                v_quantity := v_event.normalized_quantity;
                v_lifecycle := v_event.normalized_lifecycle;
                v_bound_household_id :=
                    v_event.normalized_bound_household_id;
                v_current_period_end :=
                    v_event.normalized_current_period_end;
                v_grace_end := v_event.normalized_grace_end;
                v_terminal_at := v_event.normalized_terminal_at;
                v_last_effective_at := v_event.effective_at;
                v_last_provider_order := v_event.provider_order;
                v_last_precedence := v_precedence;
                v_last_provider_event_id := v_event.provider_event_id;
                v_last_event_id := v_event.id;

                UPDATE billing_provider_events
                SET processing_status = 'scheduled',
                    processing_reason =
                        'accepted future state awaits trusted effective time',
                    processed_at = NULL
                WHERE id = v_event.id;
            END LOOP;

            UPDATE billing_subscriptions
            SET next_effective_at = v_next_effective_at,
                next_event_id = v_next_event_id
            WHERE provider = v_key.provider
              AND environment = v_key.environment
              AND provider_subscription_id =
                  v_key.provider_subscription_id
              AND provider_subscription_item_id IS NOT DISTINCT FROM
                  v_key.provider_subscription_item_id;
        END IF;
    END LOOP;
END;
$$;

CREATE FUNCTION public.refresh_user_entitlement_projection(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_grant entitlement_grants%ROWTYPE;
    v_tier TEXT := 'free';
    v_effective TIMESTAMPTZ;
    v_expires TIMESTAMPTZ;
    v_existing_effective TIMESTAMPTZ;
BEGIN
    SELECT effective_at
    INTO v_existing_effective
    FROM current_user_entitlements
    WHERE user_id = p_user_id;

    SELECT g.*
    INTO v_grant
    FROM entitlement_grants g
    WHERE g.beneficiary_user_id = p_user_id
      AND g.grant_type = 'direct_user'
      AND g.revoked_at IS NULL
      AND g.effective_at <= statement_timestamp()
      AND g.expires_at > statement_timestamp()
    ORDER BY
        CASE g.tier WHEN 'premium' THEN 2 WHEN 'plus' THEN 1 ELSE 0 END DESC,
        g.expires_at DESC,
        g.id
    LIMIT 1;

    IF FOUND THEN
        v_tier := v_grant.tier;
        v_effective := v_grant.effective_at;
        v_expires := v_grant.expires_at;
    ELSE
        v_effective := COALESCE(v_existing_effective, statement_timestamp());
    END IF;

    INSERT INTO current_user_entitlements (
        user_id,
        display_tier,
        source_base_grant_id,
        effective_at,
        expires_at
    )
    VALUES (
        p_user_id,
        v_tier,
        CASE WHEN v_tier = 'free' THEN NULL ELSE v_grant.id END,
        v_effective,
        v_expires
    )
    ON CONFLICT (user_id) DO UPDATE
    SET display_tier = EXCLUDED.display_tier,
        source_base_grant_id = EXCLUDED.source_base_grant_id,
        effective_at = EXCLUDED.effective_at,
        expires_at = EXCLUDED.expires_at,
        projection_version = current_user_entitlements.projection_version + 1,
        updated_at = statement_timestamp()
    WHERE (
        current_user_entitlements.display_tier,
        current_user_entitlements.source_base_grant_id,
        current_user_entitlements.effective_at,
        current_user_entitlements.expires_at
    ) IS DISTINCT FROM (
        EXCLUDED.display_tier,
        EXCLUDED.source_base_grant_id,
        EXCLUDED.effective_at,
        EXCLUDED.expires_at
    );
END;
$$;

CREATE FUNCTION public.refresh_household_entitlement_projection(p_household_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tier TEXT := 'free';
    v_sponsored BOOLEAN := false;
    v_allowance NUMERIC := 0;
    v_source UUID;
    v_effective TIMESTAMPTZ;
    v_expires TIMESTAMPTZ;
    v_existing_effective TIMESTAMPTZ;
BEGIN
    SELECT effective_at
    INTO v_existing_effective
    FROM current_household_entitlements
    WHERE household_id = p_household_id;

    WITH base_candidates AS (
        SELECT
            g.id AS source_grant_id,
            g.billing_account_id,
            g.tier,
            g.effective_at,
            g.expires_at AS base_expires_at,
            CASE WHEN g.grant_type = 'family_household' THEN 4::NUMERIC ELSE 2::NUMERIC END
                + CASE
                    WHEN g.grant_type = 'premium_sponsorship'
                    THEN COALESCE((
                        SELECT SUM(addon.quantity::NUMERIC)
                        FROM entitlement_grants addon
                        WHERE addon.billing_account_id = g.billing_account_id
                          AND addon.beneficiary_household_id = p_household_id
                          AND addon.grant_type = 'premium_addon'
                          AND addon.revoked_at IS NULL
                          AND addon.effective_at <= statement_timestamp()
                          AND addon.expires_at > statement_timestamp()
                    ), 0::NUMERIC)
                    ELSE 0::NUMERIC
                END AS allowance,
            CASE
                WHEN g.grant_type = 'premium_sponsorship'
                THEN (
                    SELECT MIN(addon.expires_at)
                    FROM entitlement_grants addon
                    WHERE addon.billing_account_id = g.billing_account_id
                      AND addon.beneficiary_household_id = p_household_id
                      AND addon.grant_type = 'premium_addon'
                      AND addon.revoked_at IS NULL
                      AND addon.effective_at <= statement_timestamp()
                      AND addon.expires_at > statement_timestamp()
                )
                ELSE NULL
            END AS addon_expires_at
        FROM entitlement_grants g
        WHERE g.beneficiary_household_id = p_household_id
          AND g.grant_type IN ('family_household', 'premium_sponsorship')
          AND g.revoked_at IS NULL
          AND g.effective_at <= statement_timestamp()
          AND g.expires_at > statement_timestamp()
    )
    SELECT
        tier,
        tier = 'premium',
        allowance,
        source_grant_id,
        effective_at,
        LEAST(base_expires_at, COALESCE(addon_expires_at, base_expires_at))
    INTO v_tier, v_sponsored, v_allowance, v_source, v_effective, v_expires
    FROM base_candidates
    ORDER BY
        allowance DESC,
        CASE tier WHEN 'family' THEN 2 WHEN 'premium' THEN 1 ELSE 0 END DESC,
        base_expires_at DESC,
        source_grant_id
    LIMIT 1;

    IF NOT FOUND THEN
        v_tier := 'free';
        v_sponsored := false;
        v_allowance := 0;
        v_source := NULL;
        v_effective := COALESCE(v_existing_effective, statement_timestamp());
        v_expires := NULL;
    END IF;

    IF v_allowance > 9223372036854775807::NUMERIC THEN
        RAISE EXCEPTION 'bank connection allowance exceeds BIGINT storage'
            USING ERRCODE = 'numeric_value_out_of_range';
    END IF;

    INSERT INTO current_household_entitlements (
        household_id,
        display_tier,
        is_premium_sponsored,
        bank_connection_allowance,
        source_base_grant_id,
        effective_at,
        expires_at
    )
    VALUES (
        p_household_id,
        v_tier,
        v_sponsored,
        v_allowance::BIGINT,
        v_source,
        v_effective,
        v_expires
    )
    ON CONFLICT (household_id) DO UPDATE
    SET display_tier = EXCLUDED.display_tier,
        is_premium_sponsored = EXCLUDED.is_premium_sponsored,
        bank_connection_allowance = EXCLUDED.bank_connection_allowance,
        source_base_grant_id = EXCLUDED.source_base_grant_id,
        effective_at = EXCLUDED.effective_at,
        expires_at = EXCLUDED.expires_at,
        projection_version = current_household_entitlements.projection_version + 1,
        updated_at = statement_timestamp()
    WHERE (
        current_household_entitlements.display_tier,
        current_household_entitlements.is_premium_sponsored,
        current_household_entitlements.bank_connection_allowance,
        current_household_entitlements.source_base_grant_id,
        current_household_entitlements.effective_at,
        current_household_entitlements.expires_at
    ) IS DISTINCT FROM (
        EXCLUDED.display_tier,
        EXCLUDED.is_premium_sponsored,
        EXCLUDED.bank_connection_allowance,
        EXCLUDED.source_base_grant_id,
        EXCLUDED.effective_at,
        EXCLUDED.expires_at
    );
END;
$$;

CREATE FUNCTION public.rebuild_billing_account_entitlements_internal(p_billing_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account billing_accounts%ROWTYPE;
    v_subscription billing_subscriptions%ROWTYPE;
    v_expiry TIMESTAMPTZ;
    v_sponsorship_eligible BOOLEAN;
    v_affected_household UUID;
BEGIN
    SELECT *
    INTO v_account
    FROM billing_accounts
    WHERE id = p_billing_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing account not found' USING ERRCODE = 'foreign_key_violation';
    END IF;

    PERFORM replay_billing_account_subscriptions_internal(p_billing_account_id);

    UPDATE entitlement_grants
    SET revoked_at = statement_timestamp()
    WHERE billing_account_id = p_billing_account_id
      AND revoked_at IS NULL;

    v_sponsorship_eligible := (
        v_account.owner_id IS NOT NULL
        AND v_account.premium_sponsored_household_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM household_members hm
            WHERE hm.user_id = v_account.owner_id
              AND hm.household_id = v_account.premium_sponsored_household_id
              AND hm.deleted_at IS NULL
        )
    );

    FOR v_subscription IN
        SELECT *
        FROM billing_subscriptions
        WHERE billing_account_id = p_billing_account_id
        ORDER BY id
    LOOP
        v_expiry := billing_subscription_access_expires_at(
            v_subscription.lifecycle,
            v_subscription.current_period_end,
            v_subscription.grace_end
        );
        v_expiry := LEAST(v_expiry, v_subscription.next_effective_at);

        IF v_expiry IS NULL
           OR v_expiry <= statement_timestamp()
           OR v_subscription.last_effective_at > statement_timestamp() THEN
            CONTINUE;
        END IF;

        IF v_subscription.logical_product = 'base_plan'
           AND v_subscription.tier IN ('plus', 'premium')
           AND v_account.owner_id IS NOT NULL THEN
            INSERT INTO entitlement_grants (
                billing_account_id,
                subscription_id,
                source_event_id,
                grant_type,
                beneficiary_user_id,
                tier,
                effective_at,
                expires_at,
                revoked_at
            )
            VALUES (
                p_billing_account_id,
                v_subscription.id,
                v_subscription.last_event_id,
                'direct_user',
                v_account.owner_id,
                v_subscription.tier,
                v_subscription.last_effective_at,
                v_expiry,
                NULL
            )
            ON CONFLICT (subscription_id, grant_type, beneficiary_user_id)
                WHERE beneficiary_user_id IS NOT NULL
            DO UPDATE SET
                source_event_id = EXCLUDED.source_event_id,
                tier = EXCLUDED.tier,
                effective_at = EXCLUDED.effective_at,
                expires_at = EXCLUDED.expires_at,
                revoked_at = NULL;
        END IF;

        IF v_subscription.logical_product = 'base_plan'
           AND v_subscription.tier = 'family'
           AND EXISTS (
               SELECT 1
               FROM households
               WHERE id = v_subscription.bound_household_id
           ) THEN
            INSERT INTO entitlement_grants (
                billing_account_id,
                subscription_id,
                source_event_id,
                grant_type,
                beneficiary_household_id,
                tier,
                effective_at,
                expires_at,
                revoked_at
            )
            VALUES (
                p_billing_account_id,
                v_subscription.id,
                v_subscription.last_event_id,
                'family_household',
                v_subscription.bound_household_id,
                'family',
                v_subscription.last_effective_at,
                v_expiry,
                NULL
            )
            ON CONFLICT (subscription_id, grant_type, beneficiary_household_id)
                WHERE beneficiary_household_id IS NOT NULL
            DO UPDATE SET
                source_event_id = EXCLUDED.source_event_id,
                effective_at = EXCLUDED.effective_at,
                expires_at = EXCLUDED.expires_at,
                revoked_at = NULL;

        END IF;

        IF v_subscription.logical_product = 'base_plan'
           AND v_subscription.tier = 'premium'
           AND v_sponsorship_eligible THEN
            INSERT INTO entitlement_grants (
                billing_account_id,
                subscription_id,
                source_event_id,
                grant_type,
                beneficiary_household_id,
                tier,
                effective_at,
                expires_at,
                revoked_at
            )
            VALUES (
                p_billing_account_id,
                v_subscription.id,
                v_subscription.last_event_id,
                'premium_sponsorship',
                v_account.premium_sponsored_household_id,
                'premium',
                v_subscription.last_effective_at,
                v_expiry,
                NULL
            )
            ON CONFLICT (subscription_id, grant_type, beneficiary_household_id)
                WHERE beneficiary_household_id IS NOT NULL
            DO UPDATE SET
                source_event_id = EXCLUDED.source_event_id,
                effective_at = EXCLUDED.effective_at,
                expires_at = EXCLUDED.expires_at,
                revoked_at = NULL;

        END IF;
    END LOOP;

    IF v_sponsorship_eligible
       AND EXISTS (
           SELECT 1
           FROM entitlement_grants
           WHERE billing_account_id = p_billing_account_id
             AND beneficiary_household_id = v_account.premium_sponsored_household_id
             AND grant_type = 'premium_sponsorship'
             AND revoked_at IS NULL
             AND expires_at > statement_timestamp()
       ) THEN
        FOR v_subscription IN
            SELECT *
            FROM billing_subscriptions
            WHERE billing_account_id = p_billing_account_id
              AND logical_product = 'premium_bank_addon'
            ORDER BY id
        LOOP
            v_expiry := billing_subscription_access_expires_at(
                v_subscription.lifecycle,
                v_subscription.current_period_end,
                v_subscription.grace_end
            );
            v_expiry := LEAST(v_expiry, v_subscription.next_effective_at);

            IF v_expiry IS NULL
               OR v_expiry <= statement_timestamp()
               OR v_subscription.last_effective_at > statement_timestamp() THEN
                CONTINUE;
            END IF;

            INSERT INTO entitlement_grants (
                billing_account_id,
                subscription_id,
                source_event_id,
                grant_type,
                beneficiary_household_id,
                quantity,
                effective_at,
                expires_at,
                revoked_at
            )
            VALUES (
                p_billing_account_id,
                v_subscription.id,
                v_subscription.last_event_id,
                'premium_addon',
                v_account.premium_sponsored_household_id,
                v_subscription.quantity,
                v_subscription.last_effective_at,
                v_expiry,
                NULL
            )
            ON CONFLICT (subscription_id, grant_type, beneficiary_household_id)
                WHERE beneficiary_household_id IS NOT NULL
            DO UPDATE SET
                source_event_id = EXCLUDED.source_event_id,
                quantity = EXCLUDED.quantity,
                effective_at = EXCLUDED.effective_at,
                expires_at = EXCLUDED.expires_at,
                revoked_at = NULL;
        END LOOP;
    END IF;

    IF v_account.owner_id IS NOT NULL THEN
        PERFORM refresh_user_entitlement_projection(v_account.owner_id);
    END IF;

    FOR v_affected_household IN
        SELECT household_id
        FROM (
            SELECT beneficiary_household_id AS household_id
            FROM entitlement_grants
            WHERE billing_account_id = p_billing_account_id
              AND beneficiary_household_id IS NOT NULL
            UNION
            SELECT historical_family_household_id
            FROM billing_subscriptions
            WHERE billing_account_id = p_billing_account_id
              AND historical_family_household_id IS NOT NULL
            UNION
            SELECT premium_sponsored_household_id
            FROM billing_accounts
            WHERE id = p_billing_account_id
              AND premium_sponsored_household_id IS NOT NULL
        ) affected
        ORDER BY household_id
    LOOP
        PERFORM refresh_household_entitlement_projection(v_affected_household);
    END LOOP;
END;
$$;

CREATE FUNCTION public.rebuild_entitlements_after_owner_pseudonymization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.owner_id IS NOT NULL AND NEW.owner_id IS NULL THEN
        -- The triggering UPDATE already owns this account row lock.
        PERFORM rebuild_billing_account_entitlements_internal(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_account_owner_entitlements
    AFTER UPDATE OF owner_id ON billing_accounts
    FOR EACH ROW EXECUTE FUNCTION public.rebuild_entitlements_after_owner_pseudonymization();

-- =============================================================================
-- Service-role evidence record/apply/rebuild contract
-- =============================================================================

CREATE FUNCTION public.record_billing_provider_event(
    p_billing_account_id UUID,
    p_provider_identity_id UUID,
    p_provider TEXT,
    p_environment TEXT,
    p_provider_event_id TEXT,
    p_provider_subscription_id TEXT,
    p_provider_subscription_item_id TEXT,
    p_received_at TIMESTAMPTZ,
    p_effective_at TIMESTAMPTZ,
    p_provider_order BIGINT,
    p_event_type TEXT,
    p_normalized_lifecycle TEXT,
    p_normalized_logical_product TEXT,
    p_normalized_tier TEXT,
    p_normalized_quantity BIGINT,
    p_normalized_current_period_end TIMESTAMPTZ,
    p_normalized_grace_end TIMESTAMPTZ,
    p_normalized_terminal_at TIMESTAMPTZ,
    p_normalized_bound_household_id UUID,
    p_trusted_reactivation BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_id UUID;
    v_bound_account_id UUID;
    v_binding_conflict BOOLEAN := false;
BEGIN
    IF lock_billing_accounts_internal(ARRAY[p_billing_account_id]) <> 1 THEN
        RAISE EXCEPTION 'billing account not found'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM billing_provider_identities i
        WHERE i.id = p_provider_identity_id
          AND i.billing_account_id = p_billing_account_id
          AND i.provider = p_provider
          AND i.environment = p_environment
    ) THEN
        RAISE EXCEPTION 'provider identity does not belong to the billing account/provider/environment'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(billing_purchase_lock_key(
        p_provider,
        p_environment,
        p_provider_subscription_id,
        p_provider_subscription_item_id
    ));

    INSERT INTO billing_provider_purchase_bindings (
        billing_account_id,
        provider,
        environment,
        provider_subscription_id,
        provider_subscription_item_id
    )
    VALUES (
        p_billing_account_id,
        p_provider,
        p_environment,
        p_provider_subscription_id,
        p_provider_subscription_item_id
    )
    ON CONFLICT ON CONSTRAINT
        billing_provider_purchase_bindings_purchase_unique
    DO NOTHING;

    SELECT billing_account_id
    INTO v_bound_account_id
    FROM billing_provider_purchase_bindings
    WHERE provider = p_provider
      AND environment = p_environment
      AND provider_subscription_id = p_provider_subscription_id
      AND provider_subscription_item_id IS NOT DISTINCT FROM
          p_provider_subscription_item_id;

    v_binding_conflict := v_bound_account_id <> p_billing_account_id;

    INSERT INTO billing_provider_events (
        billing_account_id,
        provider_identity_id,
        provider,
        environment,
        provider_event_id,
        provider_subscription_id,
        provider_subscription_item_id,
        received_at,
        effective_at,
        provider_order,
        event_type,
        normalized_lifecycle,
        normalized_logical_product,
        normalized_tier,
        normalized_quantity,
        normalized_current_period_end,
        normalized_grace_end,
        normalized_terminal_at,
        normalized_bound_household_id,
        trusted_reactivation,
        processing_status,
        processing_reason,
        processed_at
    )
    VALUES (
        p_billing_account_id,
        p_provider_identity_id,
        p_provider,
        p_environment,
        p_provider_event_id,
        p_provider_subscription_id,
        p_provider_subscription_item_id,
        COALESCE(p_received_at, statement_timestamp()),
        p_effective_at,
        COALESCE(p_provider_order, 0),
        p_event_type,
        p_normalized_lifecycle,
        p_normalized_logical_product,
        p_normalized_tier,
        COALESCE(p_normalized_quantity, 1),
        p_normalized_current_period_end,
        p_normalized_grace_end,
        p_normalized_terminal_at,
        p_normalized_bound_household_id,
        COALESCE(p_trusted_reactivation, false),
        CASE WHEN v_binding_conflict THEN 'rejected' ELSE 'pending' END,
        CASE
            WHEN v_binding_conflict
            THEN 'provider purchase key is already bound to another billing account'
            ELSE NULL
        END,
        CASE WHEN v_binding_conflict THEN statement_timestamp() ELSE NULL END
    )
    ON CONFLICT (provider, environment, provider_event_id) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        SELECT id
        INTO v_event_id
        FROM billing_provider_events
        WHERE provider = p_provider
          AND environment = p_environment
          AND provider_event_id = p_provider_event_id;
    END IF;

    RETURN v_event_id;
END;
$$;

CREATE FUNCTION public.apply_billing_provider_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event billing_provider_events%ROWTYPE;
    v_original_status TEXT;
    v_final_status TEXT;
BEGIN
    SELECT *
    INTO v_event
    FROM billing_provider_events
    WHERE id = p_event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing provider event not found'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    PERFORM lock_billing_accounts_internal(ARRAY[v_event.billing_account_id]);

    PERFORM pg_advisory_xact_lock(billing_purchase_lock_key(
        v_event.provider,
        v_event.environment,
        v_event.provider_subscription_id,
        v_event.provider_subscription_item_id
    ));

    SELECT *
    INTO v_event
    FROM billing_provider_events
    WHERE id = p_event_id
    FOR UPDATE;

    v_original_status := v_event.processing_status;
    IF v_original_status NOT IN ('pending', 'scheduled') THEN
        RETURN false;
    END IF;

    PERFORM rebuild_billing_account_entitlements_internal(v_event.billing_account_id);

    SELECT processing_status
    INTO v_final_status
    FROM billing_provider_events
    WHERE id = p_event_id;

    RETURN v_final_status = 'applied'
        AND v_original_status IN ('pending', 'scheduled')
        AND EXISTS (
            SELECT 1
            FROM billing_subscriptions s
            WHERE s.last_event_id = p_event_id
        );
END;
$$;

CREATE FUNCTION public.rebuild_billing_entitlements(p_billing_account_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id UUID;
    v_account_ids UUID[];
    v_count INTEGER := 0;
BEGIN
    SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::UUID[])
    INTO v_account_ids
    FROM billing_accounts
    WHERE p_billing_account_id IS NULL OR id = p_billing_account_id;

    PERFORM lock_billing_accounts_internal(v_account_ids);

    FOREACH v_account_id IN ARRAY v_account_ids LOOP
        PERFORM rebuild_billing_account_entitlements_internal(v_account_id);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- =============================================================================
-- Authenticated sponsorship and minimized entitlement RPCs
-- =============================================================================

CREATE FUNCTION public.set_my_premium_household_sponsorship(p_household_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_account_id UUID;
    v_membership_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Membership is the first lock class for membership-dependent billing
    -- operations. A concurrent removal therefore either wins before this
    -- validation or waits and clears sponsorship after this transaction.
    SELECT id
    INTO v_membership_id
    FROM household_members
    WHERE user_id = v_user_id
      AND household_id = p_household_id
      AND deleted_at IS NULL
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'active household membership required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT id
    INTO v_account_id
    FROM billing_accounts
    WHERE owner_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing account not found' USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM lock_billing_accounts_internal(ARRAY[v_account_id]);
    PERFORM rebuild_billing_account_entitlements_internal(v_account_id);

    IF NOT EXISTS (
        SELECT 1
        FROM billing_subscriptions
        WHERE billing_account_id = v_account_id
          AND logical_product = 'base_plan'
          AND tier = 'premium'
          AND last_effective_at <= statement_timestamp()
          AND billing_subscription_access_expires_at(
              lifecycle,
              current_period_end,
              grace_end
          ) > statement_timestamp()
    ) THEN
        RAISE EXCEPTION 'an active verified Premium subscription is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE billing_accounts
    SET premium_sponsored_household_id = p_household_id,
        sponsorship_updated_at = statement_timestamp()
    WHERE id = v_account_id;

    PERFORM rebuild_billing_account_entitlements_internal(v_account_id);
END;
$$;

CREATE FUNCTION public.clear_my_premium_household_sponsorship(p_household_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_account_id UUID;
    v_current_household UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT id, premium_sponsored_household_id
    INTO v_account_id, v_current_household
    FROM billing_accounts
    WHERE owner_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing account not found' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_household_id IS NOT NULL
       AND v_current_household IS DISTINCT FROM p_household_id THEN
        RAISE EXCEPTION 'requested household is not currently sponsored'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE billing_accounts
    SET premium_sponsored_household_id = NULL,
        sponsorship_updated_at = statement_timestamp()
    WHERE id = v_account_id;

    PERFORM rebuild_billing_account_entitlements_internal(v_account_id);
END;
$$;

CREATE FUNCTION public.get_my_entitlements(p_household_id UUID DEFAULT NULL)
RETURNS TABLE (
    user_display_tier TEXT,
    household_display_tier TEXT,
    bank_connection_allowance BIGINT,
    is_premium_sponsor BOOLEAN,
    is_family_bound BOOLEAN,
    effective_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    projection_version BIGINT,
    server_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_account_id UUID;
    v_related_account_id UUID;
    v_membership_id UUID;
    v_relevant_account_ids UUID[];
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_household_id IS NOT NULL THEN
        SELECT id
        INTO v_membership_id
        FROM household_members
        WHERE user_id = v_user_id
          AND household_id = p_household_id
          AND deleted_at IS NULL
        ORDER BY id
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'active household membership required'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    SELECT id
    INTO v_account_id
    FROM billing_accounts
    WHERE owner_id = v_user_id;

    SELECT COALESCE(array_agg(account_id ORDER BY account_id), ARRAY[]::UUID[])
    INTO v_relevant_account_ids
    FROM (
        SELECT a.id AS account_id
        FROM billing_accounts a
        WHERE a.owner_id = v_user_id
           OR (
               p_household_id IS NOT NULL
               AND (
                   -- Include every active member's account so a concurrent
                   -- sponsorship selection cannot enter after set discovery.
                   EXISTS (
                       SELECT 1
                       FROM household_members hm
                       WHERE hm.household_id = p_household_id
                         AND hm.user_id = a.owner_id
                         AND hm.deleted_at IS NULL
                   )
                   OR a.premium_sponsored_household_id = p_household_id
                   OR EXISTS (
                       SELECT 1
                       FROM billing_provider_events e
                       WHERE e.billing_account_id = a.id
                         AND e.normalized_bound_household_id = p_household_id
                   )
                   OR EXISTS (
                       SELECT 1
                       FROM billing_subscriptions s
                       WHERE s.billing_account_id = a.id
                         AND (
                             s.bound_household_id = p_household_id
                             OR s.historical_family_household_id = p_household_id
                         )
                   )
                   OR EXISTS (
                       SELECT 1
                       FROM entitlement_grants g
                       WHERE g.billing_account_id = a.id
                         AND g.beneficiary_household_id = p_household_id
                   )
               )
           )
    ) relevant;

    -- Never lock the caller's account first. Lock the complete relevant set in
    -- canonical UUID order, then perform every replay/rebuild under those locks.
    PERFORM lock_billing_accounts_internal(v_relevant_account_ids);

    FOREACH v_related_account_id IN ARRAY v_relevant_account_ids LOOP
        PERFORM rebuild_billing_account_entitlements_internal(v_related_account_id);
    END LOOP;

    IF v_account_id IS NULL THEN
        PERFORM refresh_user_entitlement_projection(v_user_id);
    END IF;

    IF p_household_id IS NOT NULL THEN
        PERFORM refresh_household_entitlement_projection(p_household_id);
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(u.display_tier, 'free'),
        CASE WHEN p_household_id IS NULL THEN NULL ELSE COALESCE(h.display_tier, 'free') END,
        CASE WHEN p_household_id IS NULL THEN 0 ELSE COALESCE(h.bank_connection_allowance, 0) END,
        COALESCE(
            p_household_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM entitlement_grants g
                JOIN billing_accounts a ON a.id = g.billing_account_id
                WHERE a.owner_id = v_user_id
                  AND g.beneficiary_household_id = p_household_id
                  AND g.grant_type = 'premium_sponsorship'
                  AND g.revoked_at IS NULL
                  AND g.effective_at <= statement_timestamp()
                  AND g.expires_at > statement_timestamp()
            ),
            false
        ),
        COALESCE(
            p_household_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM entitlement_grants g
                WHERE g.beneficiary_household_id = p_household_id
                  AND g.grant_type = 'family_household'
                  AND g.revoked_at IS NULL
                  AND g.effective_at <= statement_timestamp()
                  AND g.expires_at > statement_timestamp()
            ),
            false
        ),
        CASE
            WHEN p_household_id IS NULL
                THEN COALESCE(u.effective_at, statement_timestamp())
            WHEN u.display_tier <> 'free' AND h.display_tier <> 'free'
                THEN GREATEST(u.effective_at, h.effective_at)
            ELSE COALESCE(
                h.effective_at,
                u.effective_at,
                statement_timestamp()
            )
        END,
        CASE
            WHEN u.expires_at IS NOT NULL AND h.expires_at IS NOT NULL
                THEN LEAST(u.expires_at, h.expires_at)
            ELSE COALESCE(h.expires_at, u.expires_at)
        END,
        GREATEST(
            COALESCE(u.projection_version, 1),
            COALESCE(h.projection_version, 1)
        ),
        statement_timestamp()
    FROM (SELECT 1) seed
    LEFT JOIN current_user_entitlements u ON u.user_id = v_user_id
    LEFT JOIN current_household_entitlements h ON h.household_id = p_household_id;
END;
$$;

-- Membership loss immediately closes Premium sponsorship/add-on grants and
-- refreshes affected minimized projections. Family binding remains immutable
-- purchase evidence and is not transferred by membership changes.
CREATE FUNCTION public.refresh_entitlements_after_membership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_household_id UUID;
    v_account_id UUID;
    v_account_ids UUID[];
    v_household_ids UUID[];
    v_user_ids UUID[];
BEGIN
    -- The row-level DML that invoked this AFTER trigger already owns the
    -- membership row lock. Acquire every affected account only after that,
    -- and acquire the complete set in canonical UUID order.
    IF TG_OP = 'INSERT' THEN
        v_user_ids := ARRAY[NEW.user_id];
        v_household_ids := ARRAY[NEW.household_id];
    ELSIF TG_OP = 'DELETE' THEN
        v_user_ids := ARRAY[OLD.user_id];
        v_household_ids := ARRAY[OLD.household_id];
    ELSE
        SELECT array_agg(DISTINCT user_id ORDER BY user_id)
        INTO v_user_ids
        FROM unnest(ARRAY[OLD.user_id, NEW.user_id]) AS ids(user_id);

        SELECT array_agg(DISTINCT household_id ORDER BY household_id)
        INTO v_household_ids
        FROM unnest(ARRAY[OLD.household_id, NEW.household_id])
            AS ids(household_id);
    END IF;

    SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::UUID[])
    INTO v_account_ids
    FROM billing_accounts
    WHERE owner_id = ANY(v_user_ids);

    PERFORM lock_billing_accounts_internal(v_account_ids);

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_user_id := OLD.user_id;
        v_household_id := OLD.household_id;

        UPDATE billing_accounts a
        SET premium_sponsored_household_id = NULL,
            sponsorship_updated_at = statement_timestamp()
        WHERE a.owner_id = v_user_id
          AND a.premium_sponsored_household_id = v_household_id
          AND NOT EXISTS (
              SELECT 1
              FROM household_members hm
              WHERE hm.user_id = v_user_id
                AND hm.household_id = v_household_id
                AND hm.deleted_at IS NULL
          );
    END IF;

    FOREACH v_account_id IN ARRAY v_account_ids LOOP
        PERFORM rebuild_billing_account_entitlements_internal(v_account_id);
    END LOOP;

    FOREACH v_household_id IN ARRAY v_household_ids LOOP
        PERFORM refresh_household_entitlement_projection(v_household_id);
    END LOOP;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_household_members_refresh_entitlements
    AFTER INSERT OR UPDATE OF user_id, household_id, deleted_at OR DELETE
    ON household_members
    FOR EACH ROW EXECUTE FUNCTION public.refresh_entitlements_after_membership_change();

-- =============================================================================
-- RLS and least-privilege grants
-- =============================================================================

ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_provider_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_provider_purchase_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_household_entitlements ENABLE ROW LEVEL SECURITY;

-- There are intentionally no authenticated policies on billing tables.
-- SECURITY DEFINER RPCs above are the only authenticated read/write surface.
REVOKE ALL ON TABLE
    billing_accounts,
    billing_provider_identities,
    billing_provider_purchase_bindings,
    billing_subscriptions,
    billing_provider_events,
    entitlement_grants,
    current_user_entitlements,
    current_household_entitlements
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    billing_accounts,
    billing_provider_identities,
    billing_provider_purchase_bindings,
    billing_subscriptions,
    billing_provider_events,
    entitlement_grants,
    current_user_entitlements,
    current_household_entitlements
TO service_role;

REVOKE EXECUTE ON FUNCTION public.billing_event_precedence(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.billing_subscription_access_expires_at(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.billing_purchase_lock_key(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_billing_accounts_internal(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replay_billing_account_subscriptions_internal(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_user_entitlement_projection(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_household_entitlement_projection(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rebuild_billing_account_entitlements_internal(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rebuild_entitlements_after_owner_pseudonymization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_billing_provider_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_billing_provider_purchase_binding() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_billing_subscription_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_billing_provider_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pseudonymize_billing_account_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_entitlements_after_membership_change() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.record_billing_provider_event(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ,
    BIGINT, TEXT, TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ,
    TIMESTAMPTZ, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_billing_provider_event(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ,
    BIGINT, TEXT, TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ,
    TIMESTAMPTZ, UUID, BOOLEAN
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_billing_provider_event(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_provider_event(UUID)
    TO service_role;
REVOKE EXECUTE ON FUNCTION public.rebuild_billing_entitlements(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_billing_entitlements(UUID)
    TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_my_premium_household_sponsorship(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_premium_household_sponsorship(UUID)
    TO authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_my_premium_household_sponsorship(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_premium_household_sponsorship(UUID)
    TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_entitlements(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements(UUID)
    TO authenticated;

-- =============================================================================
-- Retire the untrusted legacy authorization/sync surface
-- =============================================================================

DROP POLICY IF EXISTS family_plan_select ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_insert ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_update ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_delete ON family_plan_subscriptions;
REVOKE ALL ON TABLE family_plan_subscriptions FROM anon, authenticated;

COMMENT ON TABLE family_plan_subscriptions IS
    'DEPRECATED compatibility storage. Non-authoritative, not client-readable or writable, '
    'not PowerSync-delivered, and never migrated into entitlement grants without verified '
    'provider evidence.';
COMMENT ON TABLE billing_provider_events IS
    'Append-oriented normalized provider evidence. Raw payloads, receipts, payment instruments, '
    'emails, and generic/unbounded metadata are prohibited.';
COMMENT ON TABLE billing_provider_purchase_bindings IS
    'Immutable provider purchase key to Finance billing account binding established under account-then-purchase locking.';
COMMENT ON TABLE billing_subscriptions IS
    'Mutable current purchase snapshots reconstructed deterministically from immutable normalized provider events.';
COMMENT ON TABLE current_user_entitlements IS
    'Minimized derived user projection. Sole runtime authority with expiry checks; never infer authorization from tier ordering.';
COMMENT ON TABLE current_household_entitlements IS
    'Minimized derived household projection. Bank allowance is the maximum eligible single-source candidate, never a sum across sponsors.';
COMMENT ON COLUMN billing_subscriptions.bound_household_id IS
    'Current Family scope; required only while the ordered current plan is Family. Historical binding remains immutable in historical_family_household_id.';
COMMENT ON COLUMN billing_subscriptions.historical_family_household_id IS
    'First verified Family binding for this provider purchase. Immutable once set and intentionally not a household FK so evidence survives household deletion.';
COMMENT ON COLUMN billing_provider_events.normalized_bound_household_id IS
    'Normalized historical Family binding. Intentionally retained as evidence after household deletion.';
