-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260402000001_schema_unification_superset
-- Description: Full-stack schema unification (PR1 of 3, ADDITIVE / non-breaking).
--   Brings the rich, offline-only client data model into the synced server model so
--   every feature round-trips through PowerSync once the client cuts over to the
--   unified (plural) schema. Two parts:
--     (A) Add the offline-only "superset" columns to accounts/transactions/budgets/goals.
--     (B) Create the four web-first tables that had no server home yet
--         (goal_progress_contributions, account_reconciliations, invoices, remittances).
--   This migration is purely additive: existing rows/queries/clients are unaffected, so
--   it is safe to deploy BEFORE the client rewrite (PR2). New columns/tables only become
--   visible to clients once published in sync-rules.yaml (done in this same PR).
-- Issues: live-data schema unification; fulfills the @backend-engineer note in
--   apps/web/src/db/sqlite-wasm.ts migration v14 (invoices/remittances) and v10/v7.
-- DOWN migration: services/api/supabase/migrations/down/20260402000001_schema_unification_superset.down.sql

-- =============================================================================
-- UP
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (A) Superset columns on existing core tables (all nullable / defaulted → safe).
-- -----------------------------------------------------------------------------

-- accounts: account purpose + retirement/HSA account metadata (offline v9, v12).
ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS purpose                  TEXT NOT NULL DEFAULT 'personal',
    ADD COLUMN IF NOT EXISTS retirement_account_type  TEXT,
    ADD COLUMN IF NOT EXISTS retirement_tax_treatment TEXT,
    ADD COLUMN IF NOT EXISTS hsa_coverage_level       TEXT;

COMMENT ON COLUMN accounts.purpose IS 'Account purpose classification (e.g. personal, business, retirement); offline-parity column.';

-- transactions: merchant details, external references, free-form enrichment,
-- counterparty, splits, and retirement-contribution metadata (offline v6, v11, v12).
-- mood_tag already exists (20260331000002); tags/is_biometric_protected/owner_id/
-- transfer_transaction_id/recurring_rule_id already exist from earlier migrations.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS merchant_address                    TEXT,
    ADD COLUMN IF NOT EXISTS merchant_city                       TEXT,
    ADD COLUMN IF NOT EXISTS merchant_state                      TEXT,
    ADD COLUMN IF NOT EXISTS merchant_zip                        TEXT,
    ADD COLUMN IF NOT EXISTS merchant_country                    TEXT,
    ADD COLUMN IF NOT EXISTS external_reference_id               TEXT,
    ADD COLUMN IF NOT EXISTS statement_description               TEXT,
    ADD COLUMN IF NOT EXISTS custom_fields                       TEXT,
    ADD COLUMN IF NOT EXISTS extra_notes                         TEXT,
    ADD COLUMN IF NOT EXISTS counterparty_name                   TEXT,
    ADD COLUMN IF NOT EXISTS counterparty_account_id             TEXT,
    ADD COLUMN IF NOT EXISTS splits                              TEXT,
    ADD COLUMN IF NOT EXISTS retirement_contribution_year        INTEGER,
    ADD COLUMN IF NOT EXISTS retirement_contribution_designation TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_retirement_year
    ON transactions (retirement_contribution_year)
    WHERE retirement_contribution_year IS NOT NULL;

-- budgets: manual sort ordering (offline v8).
ALTER TABLE budgets
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- goals: description + manual sort ordering (offline v6/v8).
ALTER TABLE goals
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- (B) New tables (previously web-first / localStorage-only). Column names match the
--     offline store verbatim to minimise client churn (client change = pluralise the
--     table name). All household-scoped with the standard owner_id-aware RLS.
-- -----------------------------------------------------------------------------

-- goal_progress_contributions (offline v7) — individual contributions toward a goal.
CREATE TABLE IF NOT EXISTS goal_progress_contributions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id         UUID        NOT NULL REFERENCES goals(id),
    household_id    UUID        NOT NULL REFERENCES households(id),
    owner_id        UUID        REFERENCES auth.users(id),
    amount          BIGINT      NOT NULL,
    currency        TEXT        NOT NULL DEFAULT 'USD',
    note            TEXT,
    contributed_at  TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    sync_version    BIGINT      NOT NULL DEFAULT 0,
    is_synced       BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_goal_progress_contributions_goal      ON goal_progress_contributions (goal_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goal_progress_contributions_household ON goal_progress_contributions (household_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE goal_progress_contributions IS 'Individual contributions toward a savings goal; amount is in minor units (cents).';

-- account_reconciliations (offline v10) — statement reconciliation history.
CREATE TABLE IF NOT EXISTS account_reconciliations (
    id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id                UUID        NOT NULL REFERENCES accounts(id),
    household_id              UUID        NOT NULL REFERENCES households(id),
    owner_id                  UUID        REFERENCES auth.users(id),
    statement_date            DATE        NOT NULL,
    statement_balance         BIGINT      NOT NULL,
    starting_balance          BIGINT      NOT NULL,
    cleared_transaction_count INTEGER     NOT NULL DEFAULT 0,
    transaction_ids           TEXT        NOT NULL DEFAULT '[]',
    created_by                UUID        NOT NULL REFERENCES auth.users(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                TIMESTAMPTZ,
    sync_version              BIGINT      NOT NULL DEFAULT 0,
    is_synced                 BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_account_reconciliations_account   ON account_reconciliations (account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_account_reconciliations_household ON account_reconciliations (household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_account_reconciliations_stmt_date ON account_reconciliations (statement_date) WHERE deleted_at IS NULL;
COMMENT ON TABLE account_reconciliations IS 'Statement reconciliation snapshots; balances are in minor units (cents).';

-- invoices (offline v14/v16) — freelancer invoice pipeline. household_id nullable so a
-- record created before a household exists still persists; scoped to owner in that case.
CREATE TABLE IF NOT EXISTS invoices (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id           UUID        REFERENCES households(id),
    owner_id               UUID        NOT NULL REFERENCES auth.users(id),
    client_name            TEXT        NOT NULL,
    amount_cents           BIGINT      NOT NULL,
    currency               TEXT        NOT NULL DEFAULT 'USD',
    issue_date             TEXT        NOT NULL,
    payment_term           TEXT        NOT NULL,
    status                 TEXT        NOT NULL DEFAULT 'Sent',
    expected_pay_date      TEXT        NOT NULL,
    last_contacted_date    TEXT,
    amount_paid_cents      BIGINT      NOT NULL DEFAULT 0,
    paid_date              TEXT,
    payment_account_id     UUID        REFERENCES accounts(id),
    payment_transaction_id UUID        REFERENCES transactions(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at             TIMESTAMPTZ,
    sync_version           BIGINT      NOT NULL DEFAULT 0,
    is_synced              BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_invoices_household ON invoices (household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_owner     ON invoices (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status    ON invoices (status) WHERE deleted_at IS NULL;
COMMENT ON TABLE invoices IS 'Freelancer invoice pipeline; amount_cents/amount_paid_cents are minor units.';

-- remittances (offline v14/v16) — cross-border remittance history.
CREATE TABLE IF NOT EXISTS remittances (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id         UUID        REFERENCES households(id),
    owner_id             UUID        NOT NULL REFERENCES auth.users(id),
    date                 TEXT        NOT NULL,
    source_currency      TEXT        NOT NULL,
    dest_currency        TEXT        NOT NULL,
    send_amount_minor    BIGINT      NOT NULL,
    fee_minor            BIGINT      NOT NULL,
    fx_rate              DOUBLE PRECISION NOT NULL,
    fee_model            TEXT        NOT NULL,
    reference_rate       DOUBLE PRECISION,
    recipient_name       TEXT        NOT NULL,
    recipient_country    TEXT        NOT NULL,
    note                 TEXT,
    recurrence_frequency TEXT,
    recurrence_next_date TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ,
    sync_version         BIGINT      NOT NULL DEFAULT 0,
    is_synced            BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_remittances_household ON remittances (household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_remittances_owner     ON remittances (owner_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE remittances IS 'Cross-border remittance history; send_amount_minor/fee_minor are minor units.';

-- -----------------------------------------------------------------------------
-- updated_at triggers (reuse public.set_updated_at()).
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_goal_progress_contributions_updated_at ON goal_progress_contributions;
CREATE TRIGGER trg_goal_progress_contributions_updated_at BEFORE UPDATE ON goal_progress_contributions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_account_reconciliations_updated_at ON account_reconciliations;
CREATE TRIGGER trg_account_reconciliations_updated_at BEFORE UPDATE ON account_reconciliations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_remittances_updated_at ON remittances;
CREATE TRIGGER trg_remittances_updated_at BEFORE UPDATE ON remittances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security. Household-scoped, owner_id-aware on write (mirrors accounts).
-- invoices/remittances additionally allow personal (NULL-household) rows scoped to
-- their owner, preserving the offline "create before a household exists" behaviour.
-- -----------------------------------------------------------------------------
ALTER TABLE goal_progress_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_reconciliations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittances                 ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_progress_contributions_select ON goal_progress_contributions FOR SELECT USING (household_id = ANY(public.household_ids()));
CREATE POLICY goal_progress_contributions_insert ON goal_progress_contributions FOR INSERT WITH CHECK (household_id = ANY(public.household_ids()) AND (owner_id IS NULL OR owner_id = auth.uid()));
CREATE POLICY goal_progress_contributions_update ON goal_progress_contributions FOR UPDATE USING (household_id = ANY(public.household_ids())) WITH CHECK (household_id = ANY(public.household_ids()) AND (owner_id IS NULL OR owner_id = auth.uid()));
CREATE POLICY goal_progress_contributions_delete ON goal_progress_contributions FOR DELETE USING (household_id = ANY(public.household_ids()));

CREATE POLICY account_reconciliations_select ON account_reconciliations FOR SELECT USING (household_id = ANY(public.household_ids()));
CREATE POLICY account_reconciliations_insert ON account_reconciliations FOR INSERT WITH CHECK (household_id = ANY(public.household_ids()) AND (owner_id IS NULL OR owner_id = auth.uid()));
CREATE POLICY account_reconciliations_update ON account_reconciliations FOR UPDATE USING (household_id = ANY(public.household_ids())) WITH CHECK (household_id = ANY(public.household_ids()) AND (owner_id IS NULL OR owner_id = auth.uid()));
CREATE POLICY account_reconciliations_delete ON account_reconciliations FOR DELETE USING (household_id = ANY(public.household_ids()));

CREATE POLICY invoices_select ON invoices FOR SELECT USING (household_id = ANY(public.household_ids()) OR (household_id IS NULL AND owner_id = auth.uid()));
CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (owner_id = auth.uid() AND (household_id IS NULL OR household_id = ANY(public.household_ids())));
CREATE POLICY invoices_update ON invoices FOR UPDATE USING (household_id = ANY(public.household_ids()) OR (household_id IS NULL AND owner_id = auth.uid())) WITH CHECK (owner_id = auth.uid() AND (household_id IS NULL OR household_id = ANY(public.household_ids())));
CREATE POLICY invoices_delete ON invoices FOR DELETE USING (household_id = ANY(public.household_ids()) OR (household_id IS NULL AND owner_id = auth.uid()));

CREATE POLICY remittances_select ON remittances FOR SELECT USING (household_id = ANY(public.household_ids()) OR (household_id IS NULL AND owner_id = auth.uid()));
CREATE POLICY remittances_insert ON remittances FOR INSERT WITH CHECK (owner_id = auth.uid() AND (household_id IS NULL OR household_id = ANY(public.household_ids())));
CREATE POLICY remittances_update ON remittances FOR UPDATE USING (household_id = ANY(public.household_ids()) OR (household_id IS NULL AND owner_id = auth.uid())) WITH CHECK (owner_id = auth.uid() AND (household_id IS NULL OR household_id = ANY(public.household_ids())));
CREATE POLICY remittances_delete ON remittances FOR DELETE USING (household_id = ANY(public.household_ids()) OR (household_id IS NULL AND owner_id = auth.uid()));
