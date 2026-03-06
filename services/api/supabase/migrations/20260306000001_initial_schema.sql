-- Migration: 20260306000001_initial_schema
-- Description: Create all tables for the Finance app
-- Issues: #66
--
-- Matches SQLDelight schemas in packages/models/src/commonMain/sqldelight/com/finance/db/
-- PostgreSQL adaptations:
--   - TEXT ids → UUID with gen_random_uuid() defaults
--   - INTEGER cents → BIGINT for monetary values
--   - INTEGER booleans → BOOLEAN native type
--   - TEXT dates → TIMESTAMPTZ / DATE native types
--   - Added partial indexes on deleted_at IS NULL for soft-delete queries

-- =============================================================================
-- Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- users
-- =============================================================================
-- Stores user profiles with sync metadata.
-- Maps to: User.sq

CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL,
    display_name    TEXT        NOT NULL,
    avatar_url      TEXT,
    currency_code   TEXT        NOT NULL DEFAULT 'USD',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_active ON users (id) WHERE deleted_at IS NULL;

-- =============================================================================
-- households
-- =============================================================================
-- A household groups users who share finances together.
-- Maps to: Household.sq

CREATE TABLE households (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    created_by      UUID        NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_households_created_by ON households (created_by);
CREATE INDEX idx_households_active ON households (id) WHERE deleted_at IS NULL;

-- =============================================================================
-- household_members
-- =============================================================================
-- Join table linking users to households with a role.
-- Maps to: HouseholdMember.sq

CREATE TABLE household_members (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID        NOT NULL REFERENCES households(id),
    user_id         UUID        NOT NULL REFERENCES users(id),
    role            TEXT        NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_household_members_household ON household_members (household_id);
CREATE INDEX idx_household_members_user ON household_members (user_id);
CREATE UNIQUE INDEX idx_household_members_unique
    ON household_members (household_id, user_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_household_members_active
    ON household_members (household_id, user_id)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- accounts
-- =============================================================================
-- Financial accounts (checking, savings, credit card, etc.) belonging to a household.
-- Maps to: Account.sq

CREATE TABLE accounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID        NOT NULL REFERENCES households(id),
    name            TEXT        NOT NULL,
    type            TEXT        NOT NULL,
    currency_code   TEXT        NOT NULL DEFAULT 'USD',
    balance_cents   BIGINT      NOT NULL DEFAULT 0,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    icon            TEXT,
    color           TEXT,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    sync_version    BIGINT      NOT NULL DEFAULT 0,
    is_synced       BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_accounts_household ON accounts (household_id);
CREATE INDEX idx_accounts_type ON accounts (type);
CREATE INDEX idx_accounts_active ON accounts (household_id)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- categories
-- =============================================================================
-- Transaction categories with optional parent for subcategory hierarchies.
-- Maps to: Category.sq

CREATE TABLE categories (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID        NOT NULL REFERENCES households(id),
    name            TEXT        NOT NULL,
    icon            TEXT,
    color           TEXT,
    parent_id       UUID        REFERENCES categories(id),
    is_income       BOOLEAN     NOT NULL DEFAULT false,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    sync_version    BIGINT      NOT NULL DEFAULT 0,
    is_synced       BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_categories_household ON categories (household_id);
CREATE INDEX idx_categories_parent ON categories (parent_id);
CREATE INDEX idx_categories_active ON categories (household_id)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- transactions
-- =============================================================================
-- Financial transactions linked to accounts and categories.
-- Maps to: Transaction.sq
-- Note: "transaction" is a reserved word in SQL, so we use the plural "transactions".

CREATE TABLE transactions (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id            UUID        NOT NULL REFERENCES households(id),
    account_id              UUID        NOT NULL REFERENCES accounts(id),
    category_id             UUID        REFERENCES categories(id),
    amount_cents            BIGINT      NOT NULL,
    currency_code           TEXT        NOT NULL DEFAULT 'USD',
    type                    TEXT        NOT NULL,
    payee                   TEXT,
    note                    TEXT,
    date                    DATE        NOT NULL,
    is_recurring            BOOLEAN     NOT NULL DEFAULT false,
    recurring_rule          TEXT,
    transfer_account_id     UUID        REFERENCES accounts(id),
    status                  TEXT        NOT NULL DEFAULT 'CLEARED',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ,
    sync_version            BIGINT      NOT NULL DEFAULT 0,
    is_synced               BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_transactions_household ON transactions (household_id);
CREATE INDEX idx_transactions_account ON transactions (account_id);
CREATE INDEX idx_transactions_category ON transactions (category_id);
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_type ON transactions (type);
CREATE INDEX idx_transactions_status ON transactions (status);
CREATE INDEX idx_transactions_active ON transactions (household_id, date)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- budgets
-- =============================================================================
-- Recurring spending limits linked to a category and household.
-- Maps to: Budget.sq

CREATE TABLE budgets (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID        NOT NULL REFERENCES households(id),
    category_id     UUID        NOT NULL REFERENCES categories(id),
    amount_cents    BIGINT      NOT NULL,
    currency_code   TEXT        NOT NULL DEFAULT 'USD',
    period          TEXT        NOT NULL,
    start_date      DATE        NOT NULL,
    end_date        DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    sync_version    BIGINT      NOT NULL DEFAULT 0,
    is_synced       BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_budgets_household ON budgets (household_id);
CREATE INDEX idx_budgets_category ON budgets (category_id);
CREATE INDEX idx_budgets_period ON budgets (period);
CREATE INDEX idx_budgets_active ON budgets (household_id)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- goals
-- =============================================================================
-- Savings goals with progress tracking.
-- Maps to: Goal.sq

CREATE TABLE goals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID        NOT NULL REFERENCES households(id),
    name            TEXT        NOT NULL,
    target_cents    BIGINT      NOT NULL,
    current_cents   BIGINT      NOT NULL DEFAULT 0,
    currency_code   TEXT        NOT NULL DEFAULT 'USD',
    target_date     DATE,
    icon            TEXT,
    color           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    sync_version    BIGINT      NOT NULL DEFAULT 0,
    is_synced       BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_goals_household ON goals (household_id);
CREATE INDEX idx_goals_active ON goals (household_id)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- updated_at trigger
-- =============================================================================
-- Automatically set updated_at on row modification for all tables.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_households_updated_at
    BEFORE UPDATE ON households
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_household_members_updated_at
    BEFORE UPDATE ON household_members
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_budgets_updated_at
    BEFORE UPDATE ON budgets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_goals_updated_at
    BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
