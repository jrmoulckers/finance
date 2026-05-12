-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260330000003_bill_detection_enhancements
-- Description: Add subscription categorization, calendar index, and notification integration to detected_bills
-- Issues: #1110
--
-- Enhancements:
--   - subscription_category column for automatic categorization (streaming, saas, insurance, etc.)
--   - Optimized index for calendar view (upcoming bills by date)
--   - Amount change tracking index
--
-- DOWN migration: services/api/supabase/migrations/down/20260330000003_bill_detection_enhancements.down.sql

-- =============================================================================
-- UP
-- =============================================================================

-- Subscription category for automatic bill classification.
-- Values: streaming, saas, insurance, utilities, fitness, news_media, cloud_storage, rent_mortgage, other
ALTER TABLE detected_bills
    ADD COLUMN IF NOT EXISTS subscription_category TEXT NOT NULL DEFAULT 'other'
    CHECK (subscription_category IN (
        'streaming', 'saas', 'insurance', 'utilities', 'fitness',
        'news_media', 'cloud_storage', 'rent_mortgage', 'other'
    ));

COMMENT ON COLUMN detected_bills.subscription_category IS
    'Auto-detected subscription category based on merchant name keyword matching. Values: streaming, saas, insurance, utilities, fitness, news_media, cloud_storage, rent_mortgage, other.';

-- Calendar view index: upcoming bills sorted by next expected date.
-- Supports the GET /detect-bills?action=calendar endpoint.
CREATE INDEX IF NOT EXISTS idx_detected_bills_calendar
    ON detected_bills (household_id, next_expected_date ASC)
    WHERE deleted_at IS NULL AND status IN ('detected', 'confirmed');

-- Amount variance index for flagging bills with price changes.
CREATE INDEX IF NOT EXISTS idx_detected_bills_variance
    ON detected_bills (household_id, amount_variance_cents DESC)
    WHERE deleted_at IS NULL AND amount_variance_cents > 0;
