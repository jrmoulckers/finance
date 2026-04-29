-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260328000001_family_plan_subscriptions
-- Description: Create family_plan_subscriptions table for household premium plans
-- Issues: #sprint-6
--
-- Supports:
--   - Family plan creation per household
--   - Billing owner management (one per plan)
--   - Plan sharing state with member count tracking
--   - Up to 6 members per family plan
--
-- Security:
--   - RLS enabled — household members can read, billing owner can manage
--   - Monetary values stored as BIGINT (cents) with ISO 4217 currency_code
--   - owner_id tracks who created the subscription
--
-- DOWN migration: services/api/supabase/migrations/down/20260328000001_family_plan_subscriptions.down.sql

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE family_plan_subscriptions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID        NOT NULL REFERENCES households(id),
    billing_owner_id    UUID        NOT NULL REFERENCES auth.users(id),
    owner_id            UUID        REFERENCES auth.users(id),
    plan_type           TEXT        NOT NULL DEFAULT 'family_premium'
        CHECK (plan_type IN ('family_premium', 'family_pro', 'family_business')),
    status              TEXT        NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'expired')),
    price_cents         BIGINT      NOT NULL,
    currency_code       TEXT        NOT NULL DEFAULT 'USD',
    billing_cycle       TEXT        NOT NULL DEFAULT 'monthly'
        CHECK (billing_cycle IN ('monthly', 'yearly')),
    max_members         INTEGER     NOT NULL DEFAULT 6,
    current_members     INTEGER     NOT NULL DEFAULT 1,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end  TIMESTAMPTZ,
    canceled_at         TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    external_id         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false,

    CONSTRAINT family_plan_members_limit CHECK (current_members >= 0 AND current_members <= max_members),
    CONSTRAINT family_plan_price_positive CHECK (price_cents >= 0)
);

-- Only one active subscription per household
CREATE UNIQUE INDEX idx_family_plan_household_active
    ON family_plan_subscriptions (household_id)
    WHERE deleted_at IS NULL AND status NOT IN ('canceled', 'expired');

CREATE INDEX idx_family_plan_billing_owner
    ON family_plan_subscriptions (billing_owner_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_family_plan_status
    ON family_plan_subscriptions (status)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_family_plan_expiry
    ON family_plan_subscriptions (expires_at)
    WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

COMMENT ON TABLE family_plan_subscriptions IS
    'Family premium plan subscriptions per household. One active subscription per household. Billing owner manages the plan.';
COMMENT ON COLUMN family_plan_subscriptions.price_cents IS
    'Subscription price in integer cents. BIGINT to prevent floating-point errors.';
COMMENT ON COLUMN family_plan_subscriptions.billing_owner_id IS
    'The user who pays for and manages the subscription. Must be a household member.';
COMMENT ON COLUMN family_plan_subscriptions.external_id IS
    'External payment provider subscription ID (e.g., Stripe subscription_id). Never exposed to clients.';

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER trg_family_plan_subscriptions_updated_at
    BEFORE UPDATE ON family_plan_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Enable RLS
-- =============================================================================

ALTER TABLE family_plan_subscriptions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- Household members can read their household's subscription
CREATE POLICY family_plan_select ON family_plan_subscriptions
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

-- Only billing owner can create a subscription for their household
CREATE POLICY family_plan_insert ON family_plan_subscriptions
    FOR INSERT
    WITH CHECK (
        billing_owner_id = auth.uid()
        AND household_id = ANY(auth.household_ids())
    );

-- Only billing owner can update the subscription
CREATE POLICY family_plan_update ON family_plan_subscriptions
    FOR UPDATE
    USING (billing_owner_id = auth.uid())
    WITH CHECK (billing_owner_id = auth.uid());

-- Only billing owner can soft-delete (cancel) the subscription
CREATE POLICY family_plan_delete ON family_plan_subscriptions
    FOR DELETE
    USING (billing_owner_id = auth.uid());
