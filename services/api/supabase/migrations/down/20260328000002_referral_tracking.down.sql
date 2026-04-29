-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260328000002_referral_tracking
-- Description: Drop referrals table and all related objects
-- Issues: #sprint-7

-- Drop RLS policies
DROP POLICY IF EXISTS referrals_delete ON referrals;
DROP POLICY IF EXISTS referrals_update ON referrals;
DROP POLICY IF EXISTS referrals_insert ON referrals;
DROP POLICY IF EXISTS referrals_select ON referrals;

-- Disable RLS
ALTER TABLE referrals DISABLE ROW LEVEL SECURITY;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_referrals_updated_at ON referrals;

-- Drop table (cascades indexes and constraints)
DROP TABLE IF EXISTS referrals;
