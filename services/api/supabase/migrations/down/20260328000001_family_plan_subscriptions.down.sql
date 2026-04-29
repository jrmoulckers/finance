-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260328000001_family_plan_subscriptions
-- Description: Drop family_plan_subscriptions table and all related objects
-- Issues: #sprint-6

-- Drop RLS policies
DROP POLICY IF EXISTS family_plan_delete ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_update ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_insert ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_select ON family_plan_subscriptions;

-- Disable RLS
ALTER TABLE family_plan_subscriptions DISABLE ROW LEVEL SECURITY;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_family_plan_subscriptions_updated_at ON family_plan_subscriptions;

-- Drop table (cascades indexes and constraints)
DROP TABLE IF EXISTS family_plan_subscriptions;
