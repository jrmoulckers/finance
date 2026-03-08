-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260306000002_rls_policies
-- Description: Enable RLS on all tables and create tenant-isolation policies
-- Issues: #67
--
-- Security model:
--   - Every table has RLS enabled (no exceptions)
--   - Household-scoped tables: access gated by household membership
--   - users: each user can only see/update their own row
--   - households: members can read, only creator (created_by) can update
--   - household_members: members can see co-members, only household owner can manage

-- =============================================================================
-- Helper function: auth.household_ids()
-- =============================================================================
-- Returns an array of household IDs the current JWT user belongs to.
-- Used in RLS policies for efficient household membership checks.

CREATE OR REPLACE FUNCTION auth.household_ids()
RETURNS UUID[] AS $$
    SELECT COALESCE(
        array_agg(household_id),
        '{}'::UUID[]
    )
    FROM household_members
    WHERE user_id = auth.uid()
      AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================================================
-- Enable RLS on ALL tables
-- =============================================================================

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE households         ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals              ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- users — user can only see/update their own row
-- =============================================================================

CREATE POLICY users_select ON users
    FOR SELECT
    USING (id = auth.uid());

CREATE POLICY users_insert ON users
    FOR INSERT
    WITH CHECK (id = auth.uid());

CREATE POLICY users_update ON users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- No hard delete — soft delete only via UPDATE setting deleted_at
CREATE POLICY users_delete ON users
    FOR DELETE
    USING (id = auth.uid());

-- =============================================================================
-- households — members can read, only creator can update/delete
-- =============================================================================

CREATE POLICY households_select ON households
    FOR SELECT
    USING (id = ANY(auth.household_ids()));

CREATE POLICY households_insert ON households
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY households_update ON households
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY households_delete ON households
    FOR DELETE
    USING (created_by = auth.uid());

-- =============================================================================
-- household_members — members can see co-members, only household owner can manage
-- =============================================================================

CREATE POLICY household_members_select ON household_members
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY household_members_insert ON household_members
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    );

CREATE POLICY household_members_update ON household_members
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_members.household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_members.household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    );

CREATE POLICY household_members_delete ON household_members
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_members.household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    );

-- =============================================================================
-- accounts — household members only
-- =============================================================================

CREATE POLICY accounts_select ON accounts
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY accounts_insert ON accounts
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY accounts_update ON accounts
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY accounts_delete ON accounts
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));

-- =============================================================================
-- categories — household members only
-- =============================================================================

CREATE POLICY categories_select ON categories
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY categories_insert ON categories
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY categories_update ON categories
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY categories_delete ON categories
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));

-- =============================================================================
-- transactions — household members only
-- =============================================================================

CREATE POLICY transactions_select ON transactions
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY transactions_insert ON transactions
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY transactions_update ON transactions
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY transactions_delete ON transactions
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));

-- =============================================================================
-- budgets — household members only
-- =============================================================================

CREATE POLICY budgets_select ON budgets
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY budgets_insert ON budgets
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY budgets_update ON budgets
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY budgets_delete ON budgets
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));

-- =============================================================================
-- goals — household members only
-- =============================================================================

CREATE POLICY goals_select ON goals
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY goals_insert ON goals
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY goals_update ON goals
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY goals_delete ON goals
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));
