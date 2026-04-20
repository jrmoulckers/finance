-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260306000002_rls_policies
-- Description: Drop all RLS policies and disable RLS on all tables
-- Issues: #893
--
-- WARNING: Disabling RLS removes ALL access control. Only run this as part
-- of a full schema teardown (followed by 20260306000001 down migration).

-- =============================================================================
-- Drop RLS policies
-- =============================================================================

-- goals
DROP POLICY IF EXISTS goals_delete ON goals;
DROP POLICY IF EXISTS goals_update ON goals;
DROP POLICY IF EXISTS goals_insert ON goals;
DROP POLICY IF EXISTS goals_select ON goals;

-- budgets
DROP POLICY IF EXISTS budgets_delete ON budgets;
DROP POLICY IF EXISTS budgets_update ON budgets;
DROP POLICY IF EXISTS budgets_insert ON budgets;
DROP POLICY IF EXISTS budgets_select ON budgets;

-- transactions
DROP POLICY IF EXISTS transactions_delete ON transactions;
DROP POLICY IF EXISTS transactions_update ON transactions;
DROP POLICY IF EXISTS transactions_insert ON transactions;
DROP POLICY IF EXISTS transactions_select ON transactions;

-- categories
DROP POLICY IF EXISTS categories_delete ON categories;
DROP POLICY IF EXISTS categories_update ON categories;
DROP POLICY IF EXISTS categories_insert ON categories;
DROP POLICY IF EXISTS categories_select ON categories;

-- accounts
DROP POLICY IF EXISTS accounts_delete ON accounts;
DROP POLICY IF EXISTS accounts_update ON accounts;
DROP POLICY IF EXISTS accounts_insert ON accounts;
DROP POLICY IF EXISTS accounts_select ON accounts;

-- household_members
DROP POLICY IF EXISTS household_members_delete ON household_members;
DROP POLICY IF EXISTS household_members_update ON household_members;
DROP POLICY IF EXISTS household_members_insert ON household_members;
DROP POLICY IF EXISTS household_members_select ON household_members;

-- households
DROP POLICY IF EXISTS households_delete ON households;
DROP POLICY IF EXISTS households_update ON households;
DROP POLICY IF EXISTS households_insert ON households;
DROP POLICY IF EXISTS households_select ON households;

-- users
DROP POLICY IF EXISTS users_delete ON users;
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_insert ON users;
DROP POLICY IF EXISTS users_select ON users;

-- =============================================================================
-- Disable RLS on all tables
-- =============================================================================
ALTER TABLE goals              DISABLE ROW LEVEL SECURITY;
ALTER TABLE budgets            DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories         DISABLE ROW LEVEL SECURITY;
ALTER TABLE accounts           DISABLE ROW LEVEL SECURITY;
ALTER TABLE household_members  DISABLE ROW LEVEL SECURITY;
ALTER TABLE households         DISABLE ROW LEVEL SECURITY;
ALTER TABLE users              DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Drop helper function
-- =============================================================================
DROP FUNCTION IF EXISTS auth.household_ids();
