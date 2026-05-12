-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260330000003_bill_detection_enhancements
-- Description: Revert subscription categorization and calendar enhancements
-- Issues: #1110

-- Drop new indexes
DROP INDEX IF EXISTS idx_detected_bills_variance;
DROP INDEX IF EXISTS idx_detected_bills_calendar;

-- Remove subscription_category column
ALTER TABLE detected_bills DROP COLUMN IF EXISTS subscription_category;
