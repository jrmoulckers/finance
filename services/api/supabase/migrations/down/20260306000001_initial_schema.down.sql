-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260306000001_initial_schema
-- Description: Drop all tables, triggers, functions, and extensions from initial schema
-- Issues: #893
--
-- WARNING: This is a DESTRUCTIVE operation. It drops ALL core tables and their data.
-- Only run this if you are completely removing the application schema.
-- Requires explicit human approval before execution.
--
-- Dependencies: Must be run AFTER all other down migrations that reference these tables.
-- Run order: This should be the LAST down migration executed.

-- =============================================================================
-- Drop triggers first (they reference the function)
-- =============================================================================
DROP TRIGGER IF EXISTS trg_goals_updated_at ON goals;
DROP TRIGGER IF EXISTS trg_budgets_updated_at ON budgets;
DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
DROP TRIGGER IF EXISTS trg_household_members_updated_at ON household_members;
DROP TRIGGER IF EXISTS trg_households_updated_at ON households;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;

-- =============================================================================
-- Drop the trigger function
-- =============================================================================
DROP FUNCTION IF EXISTS public.set_updated_at();

-- =============================================================================
-- Drop tables in reverse dependency order
-- =============================================================================
-- goals → households
DROP TABLE IF EXISTS goals;

-- budgets → households, categories
DROP TABLE IF EXISTS budgets;

-- transactions → households, accounts, categories
DROP TABLE IF EXISTS transactions;

-- categories → households (self-referencing parent_id handled by CASCADE)
DROP TABLE IF EXISTS categories;

-- accounts → households
DROP TABLE IF EXISTS accounts;

-- household_members → households, users
DROP TABLE IF EXISTS household_members;

-- households → users
DROP TABLE IF EXISTS households;

-- users (no dependencies)
DROP TABLE IF EXISTS users;

-- =============================================================================
-- Extensions (optional — may be shared with other schemas)
-- =============================================================================
-- Only drop if no other schema uses them.
-- DROP EXTENSION IF EXISTS "uuid-ossp";
-- DROP EXTENSION IF EXISTS "pgcrypto";
