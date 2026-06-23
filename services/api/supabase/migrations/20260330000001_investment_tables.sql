-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260330000001_investment_tables
-- Description: Create investment_portfolios, investment_holdings, price_history,
--              bill_reminders, and report_templates tables for v2.0
-- Issues: #sprint-backend-1, #sprint-backend-10
-- DOWN migration: services/api/supabase/migrations/down/20260330000001_investment_tables.down.sql

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE investment_portfolios (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        NOT NULL REFERENCES auth.users(id),
    name                TEXT        NOT NULL,
    description         TEXT,
    currency_code       TEXT        NOT NULL DEFAULT 'USD',
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    provider            TEXT        CHECK (provider IS NULL OR provider IN ('manual', 'plaid', 'yodlee', 'finicity')),
    provider_account_id TEXT,
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false,
    CONSTRAINT valid_portfolio_currency CHECK (length(currency_code) = 3 AND currency_code = upper(currency_code))
);

CREATE INDEX idx_investment_portfolios_household ON investment_portfolios (household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_investment_portfolios_owner ON investment_portfolios (owner_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE investment_portfolios IS 'Investment portfolio accounts grouped by household.';

CREATE TABLE investment_holdings (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id        UUID        NOT NULL REFERENCES investment_portfolios(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        NOT NULL REFERENCES auth.users(id),
    ticker_symbol       TEXT        NOT NULL,
    name                TEXT        NOT NULL,
    asset_type          TEXT        NOT NULL DEFAULT 'stock' CHECK (asset_type IN ('stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'option', 'other')),
    quantity_units      BIGINT      NOT NULL DEFAULT 0,
    quantity_precision  INTEGER     NOT NULL DEFAULT 0,
    cost_basis_cents    BIGINT      NOT NULL DEFAULT 0,
    currency_code       TEXT        NOT NULL DEFAULT 'USD',
    acquired_date       DATE,
    lot_id              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false,
    CONSTRAINT valid_holding_currency CHECK (length(currency_code) = 3 AND currency_code = upper(currency_code)),
    CONSTRAINT quantity_non_negative CHECK (quantity_units >= 0),
    CONSTRAINT precision_valid CHECK (quantity_precision >= 0 AND quantity_precision <= 12)
);

CREATE INDEX idx_investment_holdings_portfolio ON investment_holdings (portfolio_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_investment_holdings_household ON investment_holdings (household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_investment_holdings_ticker ON investment_holdings (ticker_symbol) WHERE deleted_at IS NULL;

CREATE TABLE price_history (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker_symbol       TEXT        NOT NULL,
    close_price_cents   BIGINT      NOT NULL,
    currency_code       TEXT        NOT NULL DEFAULT 'USD',
    open_price_cents    BIGINT,
    high_price_cents    BIGINT,
    low_price_cents     BIGINT,
    volume              BIGINT,
    price_date          DATE        NOT NULL,
    source              TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api', 'ecb', 'yahoo', 'alpha_vantage')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false,
    CONSTRAINT price_positive CHECK (close_price_cents > 0),
    CONSTRAINT valid_price_currency CHECK (length(currency_code) = 3 AND currency_code = upper(currency_code))
);

CREATE UNIQUE INDEX idx_price_history_ticker_date ON price_history (ticker_symbol, price_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_price_history_date ON price_history (price_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_price_history_ticker ON price_history (ticker_symbol, price_date DESC) WHERE deleted_at IS NULL;

CREATE TABLE bill_reminders (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        NOT NULL REFERENCES auth.users(id),
    detected_bill_id    UUID        REFERENCES detected_bills(id),
    merchant            TEXT        NOT NULL,
    amount_cents        BIGINT      NOT NULL,
    currency_code       TEXT        NOT NULL DEFAULT 'USD',
    frequency           TEXT        NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
    next_due_date       DATE        NOT NULL,
    is_auto_pay         BOOLEAN     NOT NULL DEFAULT false,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    reminder_days       INTEGER     NOT NULL DEFAULT 3 CHECK (reminder_days >= 0 AND reminder_days <= 30),
    account_id          UUID        REFERENCES accounts(id),
    category_id         UUID        REFERENCES categories(id),
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false,
    CONSTRAINT bill_amount_positive CHECK (amount_cents > 0),
    CONSTRAINT valid_reminder_currency CHECK (length(currency_code) = 3 AND currency_code = upper(currency_code))
);

CREATE INDEX idx_bill_reminders_household ON bill_reminders (household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bill_reminders_next_due ON bill_reminders (next_due_date) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_bill_reminders_owner ON bill_reminders (owner_id) WHERE deleted_at IS NULL;

CREATE TABLE report_templates (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        NOT NULL REFERENCES auth.users(id),
    name                TEXT        NOT NULL,
    description         TEXT,
    report_type         TEXT        NOT NULL DEFAULT 'spending_summary' CHECK (report_type IN ('spending_summary', 'income_expense', 'category_breakdown', 'account_balance', 'budget_variance', 'trend_analysis', 'investment_summary', 'net_worth')),
    template_config     JSONB       NOT NULL DEFAULT '{}',
    is_default          BOOLEAN     NOT NULL DEFAULT false,
    usage_count         INTEGER     NOT NULL DEFAULT 0,
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_report_templates_household ON report_templates (household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_report_templates_owner ON report_templates (owner_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_report_templates_default ON report_templates (household_id, report_type) WHERE deleted_at IS NULL AND is_default = true;

-- updated_at triggers
CREATE TRIGGER trg_investment_portfolios_updated_at BEFORE UPDATE ON investment_portfolios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_investment_holdings_updated_at BEFORE UPDATE ON investment_holdings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_price_history_updated_at BEFORE UPDATE ON price_history FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bill_reminders_updated_at BEFORE UPDATE ON bill_reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_report_templates_updated_at BEFORE UPDATE ON report_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE investment_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY investment_portfolios_select ON investment_portfolios FOR SELECT USING (household_id = ANY(public.household_ids()));
CREATE POLICY investment_portfolios_insert ON investment_portfolios FOR INSERT WITH CHECK (owner_id = auth.uid() AND household_id = ANY(public.household_ids()));
CREATE POLICY investment_portfolios_update ON investment_portfolios FOR UPDATE USING (household_id = ANY(public.household_ids())) WITH CHECK (household_id = ANY(public.household_ids()));
CREATE POLICY investment_portfolios_delete ON investment_portfolios FOR DELETE USING (household_id = ANY(public.household_ids()));

CREATE POLICY investment_holdings_select ON investment_holdings FOR SELECT USING (household_id = ANY(public.household_ids()));
CREATE POLICY investment_holdings_insert ON investment_holdings FOR INSERT WITH CHECK (owner_id = auth.uid() AND household_id = ANY(public.household_ids()));
CREATE POLICY investment_holdings_update ON investment_holdings FOR UPDATE USING (household_id = ANY(public.household_ids())) WITH CHECK (household_id = ANY(public.household_ids()));
CREATE POLICY investment_holdings_delete ON investment_holdings FOR DELETE USING (household_id = ANY(public.household_ids()));

CREATE POLICY bill_reminders_select ON bill_reminders FOR SELECT USING (household_id = ANY(public.household_ids()));
CREATE POLICY bill_reminders_insert ON bill_reminders FOR INSERT WITH CHECK (owner_id = auth.uid() AND household_id = ANY(public.household_ids()));
CREATE POLICY bill_reminders_update ON bill_reminders FOR UPDATE USING (household_id = ANY(public.household_ids())) WITH CHECK (household_id = ANY(public.household_ids()));
CREATE POLICY bill_reminders_delete ON bill_reminders FOR DELETE USING (household_id = ANY(public.household_ids()));

CREATE POLICY report_templates_select ON report_templates FOR SELECT USING (household_id = ANY(public.household_ids()));
CREATE POLICY report_templates_insert ON report_templates FOR INSERT WITH CHECK (owner_id = auth.uid() AND household_id = ANY(public.household_ids()));
CREATE POLICY report_templates_update ON report_templates FOR UPDATE USING (household_id = ANY(public.household_ids())) WITH CHECK (household_id = ANY(public.household_ids()));
CREATE POLICY report_templates_delete ON report_templates FOR DELETE USING (household_id = ANY(public.household_ids()));

CREATE POLICY price_history_select ON price_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY price_history_insert ON price_history FOR INSERT WITH CHECK (false);
CREATE POLICY price_history_update ON price_history FOR UPDATE USING (false);
CREATE POLICY price_history_delete ON price_history FOR DELETE USING (false);
