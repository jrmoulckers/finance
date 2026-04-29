-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260328000005_bill_detection
-- Description: Drop detected_bills table and all related objects
-- Issues: #sprint-10

-- Drop RLS policies
DROP POLICY IF EXISTS detected_bills_delete ON detected_bills;
DROP POLICY IF EXISTS detected_bills_update ON detected_bills;
DROP POLICY IF EXISTS detected_bills_insert ON detected_bills;
DROP POLICY IF EXISTS detected_bills_select ON detected_bills;

-- Disable RLS
ALTER TABLE detected_bills DISABLE ROW LEVEL SECURITY;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_detected_bills_updated_at ON detected_bills;

-- Drop table (cascades indexes and constraints)
DROP TABLE IF EXISTS detected_bills;
