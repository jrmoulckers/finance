-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260328000004_exchange_rates
-- Description: Create exchange_rates table for multi-currency support
-- Issues: #sprint-9
--
-- Supports:
--   - Daily exchange rates from ECB (European Central Bank) free API
--   - DB-level caching to minimize external API calls
--   - Rate stored as BIGINT with 6 decimal precision (multiply by 1,000,000)
--   - PowerSync replication to clients for offline conversion
--
-- Rate Storage:
--   Exchange rates are stored as BIGINT representing the rate multiplied
--   by 1,000,000 (6 decimal places of precision). For example:
--     EUR/USD = 1.085432 → stored as 1085432
--   This avoids floating-point precision issues while maintaining
--   sufficient precision for financial calculations.
--
-- Security:
--   - RLS enabled — all authenticated users can read rates
--   - Only service role can insert/update (Edge Function)
--   - No household scoping needed — rates are global
--
-- DOWN migration: services/api/supabase/migrations/down/20260328000004_exchange_rates.down.sql

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE exchange_rates (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency       TEXT        NOT NULL,
    target_currency     TEXT        NOT NULL,
    rate_multiplied     BIGINT      NOT NULL,
    rate_precision      INTEGER     NOT NULL DEFAULT 6,
    source              TEXT        NOT NULL DEFAULT 'ecb',
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false,

    CONSTRAINT rate_positive CHECK (rate_multiplied > 0),
    CONSTRAINT valid_currency_codes CHECK (
        length(base_currency) = 3 AND length(target_currency) = 3
        AND base_currency = upper(base_currency) AND target_currency = upper(target_currency)
    )
);

-- Only one rate per currency pair per date
CREATE UNIQUE INDEX idx_exchange_rates_pair_date
    ON exchange_rates (base_currency, target_currency, valid_date)
    WHERE deleted_at IS NULL;

-- Fast lookups for conversion
CREATE INDEX idx_exchange_rates_base
    ON exchange_rates (base_currency, valid_date DESC)
    WHERE deleted_at IS NULL;

-- Latest rates lookup
CREATE INDEX idx_exchange_rates_latest
    ON exchange_rates (valid_date DESC)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE exchange_rates IS
    'Cached exchange rates from ECB. Rate = rate_multiplied / 10^rate_precision. Global data — not household-scoped.';
COMMENT ON COLUMN exchange_rates.rate_multiplied IS
    'Exchange rate multiplied by 10^rate_precision. E.g., 1.085432 stored as 1085432 (precision=6). BIGINT for exact arithmetic.';
COMMENT ON COLUMN exchange_rates.rate_precision IS
    'Number of decimal places. rate = rate_multiplied / 10^rate_precision. Default 6.';
COMMENT ON COLUMN exchange_rates.valid_date IS
    'The date this rate is valid for. ECB publishes one rate per business day.';

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER trg_exchange_rates_updated_at
    BEFORE UPDATE ON exchange_rates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Enable RLS
-- =============================================================================

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- All authenticated users can read exchange rates (global data)
CREATE POLICY exchange_rates_select ON exchange_rates
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only service role can insert (bypasses RLS) — Edge Function uses service_role
CREATE POLICY exchange_rates_insert ON exchange_rates
    FOR INSERT
    WITH CHECK (false);

-- Only service role can update
CREATE POLICY exchange_rates_update ON exchange_rates
    FOR UPDATE
    USING (false);

-- Only service role can delete
CREATE POLICY exchange_rates_delete ON exchange_rates
    FOR DELETE
    USING (false);
