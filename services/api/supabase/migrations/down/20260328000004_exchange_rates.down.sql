-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260328000004_exchange_rates
-- Description: Drop exchange_rates table and all related objects
-- Issues: #sprint-9

-- Drop RLS policies
DROP POLICY IF EXISTS exchange_rates_delete ON exchange_rates;
DROP POLICY IF EXISTS exchange_rates_update ON exchange_rates;
DROP POLICY IF EXISTS exchange_rates_insert ON exchange_rates;
DROP POLICY IF EXISTS exchange_rates_select ON exchange_rates;

-- Disable RLS
ALTER TABLE exchange_rates DISABLE ROW LEVEL SECURITY;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_exchange_rates_updated_at ON exchange_rates;

-- Drop table (cascades indexes and constraints)
DROP TABLE IF EXISTS exchange_rates;
