-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260328000002_referral_tracking
-- Description: Create referrals table for referral code generation, tracking, and rewards
-- Issues: #sprint-7
--
-- Supports:
--   - Unique referral code generation per user
--   - Tracking referral acceptance
--   - Reward application (free month / discount as BIGINT cents)
--   - Prevention of self-referral and duplicate referrals
--
-- Security:
--   - RLS enabled — users can see referrals where they are referrer or referee
--   - Self-referral blocked by CHECK constraint
--   - Duplicate referrals prevented by unique index
--   - Monetary rewards stored as BIGINT cents
--
-- DOWN migration: services/api/supabase/migrations/down/20260328000002_referral_tracking.down.sql

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE referrals (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id         UUID        NOT NULL REFERENCES auth.users(id),
    referee_id          UUID        REFERENCES auth.users(id),
    referral_code       TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rewarded', 'expired', 'revoked')),
    reward_type         TEXT
        CHECK (reward_type IS NULL OR reward_type IN ('free_month', 'discount_cents', 'premium_trial')),
    reward_amount_cents BIGINT      DEFAULT 0,
    reward_currency_code TEXT       DEFAULT 'USD',
    reward_applied_at   TIMESTAMPTZ,
    accepted_at         TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    -- Prevent self-referral at the database level
    CONSTRAINT no_self_referral CHECK (referrer_id != referee_id),
    CONSTRAINT reward_amount_non_negative CHECK (reward_amount_cents >= 0)
);

-- Each referral code must be globally unique
CREATE UNIQUE INDEX idx_referrals_code_unique
    ON referrals (referral_code)
    WHERE deleted_at IS NULL;

-- A user can only be referred once (prevent duplicate referrals)
CREATE UNIQUE INDEX idx_referrals_referee_unique
    ON referrals (referee_id)
    WHERE referee_id IS NOT NULL AND deleted_at IS NULL;

-- Lookup referrals by referrer
CREATE INDEX idx_referrals_referrer
    ON referrals (referrer_id)
    WHERE deleted_at IS NULL;

-- Lookup referrals by status for processing
CREATE INDEX idx_referrals_status
    ON referrals (status)
    WHERE deleted_at IS NULL;

-- Expiry check index
CREATE INDEX idx_referrals_expires
    ON referrals (expires_at)
    WHERE deleted_at IS NULL AND status = 'pending';

COMMENT ON TABLE referrals IS
    'Tracks referral codes and their acceptance/reward status. Self-referral and duplicate referrals are prevented by constraints.';
COMMENT ON COLUMN referrals.referral_code IS
    'Unique, URL-safe referral code generated per referrer.';
COMMENT ON COLUMN referrals.reward_amount_cents IS
    'Reward amount in integer cents. BIGINT to prevent floating-point errors. Zero for non-monetary rewards like free_month.';
COMMENT ON COLUMN referrals.referee_id IS
    'NULL until the referral is accepted by a new user.';

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER trg_referrals_updated_at
    BEFORE UPDATE ON referrals
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Enable RLS
-- =============================================================================

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- Users can see referrals they created or accepted
CREATE POLICY referrals_select ON referrals
    FOR SELECT
    USING (referrer_id = auth.uid() OR referee_id = auth.uid());

-- Users can create referrals where they are the referrer
CREATE POLICY referrals_insert ON referrals
    FOR INSERT
    WITH CHECK (referrer_id = auth.uid());

-- Only the referrer can update their referral
CREATE POLICY referrals_update ON referrals
    FOR UPDATE
    USING (referrer_id = auth.uid())
    WITH CHECK (referrer_id = auth.uid());

-- Service role handles reward application and acceptance (bypasses RLS).
-- Users cannot delete referrals — soft-delete only via service role.
CREATE POLICY referrals_delete ON referrals
    FOR DELETE
    USING (false);
