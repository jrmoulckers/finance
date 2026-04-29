-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260328000005_bill_detection
-- Description: Create detected_bills table for recurring bill detection
-- Issues: #sprint-10
--
-- Supports:
--   - Automatic detection of recurring bills from transaction patterns
--   - Tracking detected merchant, estimated amount, frequency, and confidence
--   - Next expected date prediction
--   - User confirmation/dismissal of detected bills
--
-- Security:
--   - RLS enabled — household-scoped access
--   - Monetary values stored as BIGINT (cents) with ISO 4217 currency_code
--   - owner_id tracks who triggered the detection
--
-- DOWN migration: services/api/supabase/migrations/down/20260328000005_bill_detection.down.sql

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE detected_bills (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id            UUID        NOT NULL REFERENCES households(id),
    owner_id                UUID        REFERENCES auth.users(id),
    merchant                TEXT        NOT NULL,
    estimated_amount_cents  BIGINT      NOT NULL,
    currency_code           TEXT        NOT NULL DEFAULT 'USD',
    frequency               TEXT        NOT NULL
        CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
    confidence_score        INTEGER     NOT NULL DEFAULT 0
        CHECK (confidence_score >= 0 AND confidence_score <= 100),
    last_transaction_id     UUID        REFERENCES transactions(id),
    last_transaction_date   DATE,
    next_expected_date      DATE,
    transaction_count       INTEGER     NOT NULL DEFAULT 0,
    avg_amount_cents        BIGINT      NOT NULL DEFAULT 0,
    amount_variance_cents   BIGINT      NOT NULL DEFAULT 0,
    status                  TEXT        NOT NULL DEFAULT 'detected'
        CHECK (status IN ('detected', 'confirmed', 'dismissed', 'expired')),
    category_id             UUID        REFERENCES categories(id),
    account_id              UUID        REFERENCES accounts(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ,
    sync_version            BIGINT      NOT NULL DEFAULT 0,
    is_synced               BOOLEAN     NOT NULL DEFAULT false,

    CONSTRAINT estimated_amount_non_negative CHECK (estimated_amount_cents >= 0),
    CONSTRAINT avg_amount_non_negative CHECK (avg_amount_cents >= 0)
);

-- One detected bill per merchant per household (prevent duplicates)
CREATE UNIQUE INDEX idx_detected_bills_merchant_household
    ON detected_bills (household_id, lower(merchant))
    WHERE deleted_at IS NULL AND status NOT IN ('dismissed', 'expired');

CREATE INDEX idx_detected_bills_household
    ON detected_bills (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_detected_bills_status
    ON detected_bills (household_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_detected_bills_next_expected
    ON detected_bills (next_expected_date)
    WHERE deleted_at IS NULL AND status IN ('detected', 'confirmed');

CREATE INDEX idx_detected_bills_confidence
    ON detected_bills (household_id, confidence_score DESC)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE detected_bills IS
    'Automatically detected recurring bills from transaction pattern analysis. Household-scoped with confidence scoring.';
COMMENT ON COLUMN detected_bills.estimated_amount_cents IS
    'Estimated bill amount in integer cents. BIGINT for exact arithmetic.';
COMMENT ON COLUMN detected_bills.confidence_score IS
    'Detection confidence: 0-100. Higher means more certain the pattern is a recurring bill.';
COMMENT ON COLUMN detected_bills.amount_variance_cents IS
    'Standard deviation of bill amounts in cents. Low variance = high confidence.';
COMMENT ON COLUMN detected_bills.frequency IS
    'Detected billing frequency: weekly, biweekly, monthly, quarterly, yearly.';

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER trg_detected_bills_updated_at
    BEFORE UPDATE ON detected_bills
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Enable RLS
-- =============================================================================

ALTER TABLE detected_bills ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies
-- =============================================================================

CREATE POLICY detected_bills_select ON detected_bills
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY detected_bills_insert ON detected_bills
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY detected_bills_update ON detected_bills
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY detected_bills_delete ON detected_bills
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));
