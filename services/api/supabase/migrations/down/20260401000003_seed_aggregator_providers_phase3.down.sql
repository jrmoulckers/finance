-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260401000003_seed_aggregator_providers_phase3
-- Reverts: Phase 3 aggregator provider registry alignment (#3848)
--
-- Restores the priorities/enabled flags seeded by 20260331000001 for the
-- providers that existed there (plaid -> 1, mx -> 2, finicity -> 4, both
-- enabled/active) and removes the net-new TrueLayer placeholder row.
--
-- NOTE: Provider rows are reference data. This down migration is safe to run
-- because aggregator_providers.name is UNIQUE and TrueLayer is only ever
-- introduced by the paired up migration.

-- Remove the net-new TrueLayer placeholder.
DELETE FROM aggregator_providers WHERE name = 'truelayer';

-- Restore prior priorities / enabled flags for pre-existing providers.
UPDATE aggregator_providers
    SET priority = 1, is_enabled = true, status = 'active', updated_at = now()
    WHERE name = 'plaid';

UPDATE aggregator_providers
    SET priority = 2, is_enabled = true, status = 'active', updated_at = now()
    WHERE name = 'mx';

UPDATE aggregator_providers
    SET priority = 4, is_enabled = true, status = 'active', updated_at = now()
    WHERE name = 'finicity';
