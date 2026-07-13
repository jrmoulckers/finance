-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260401000003_seed_aggregator_providers_phase3
-- Description: Phase 3 aggregator provider registry alignment (#3848, epic #3846).
--   Establishes Plaid as the primary, enabled aggregator (priority 0) and MX
--   as the secondary enabled aggregator (priority 1). Adds TrueLayer and
--   (re)registers Finicity as DISABLED placeholders for future work.
--
--   The aggregator-health function orders providers by `priority ASC`, so
--   priority 0 makes Plaid the default/first-choice provider and priority 1
--   makes MX the first failover target.
--
-- Idempotency:
--   Uses INSERT ... ON CONFLICT (name) DO UPDATE so re-running (or running
--   after the 20260331000001 foundation seed) converges to the intended
--   priorities and enabled flags without duplicating rows.
--
-- Security:
--   - Reference data only (no user/financial data).
--   - RLS on aggregator_providers already restricts writes to service_role.
--   - No secrets stored here — provider credentials live in env vars only.
--
-- DOWN migration: services/api/supabase/migrations/down/20260401000003_seed_aggregator_providers_phase3.down.sql

-- =============================================================================
-- Upsert Phase 3 provider registry
-- =============================================================================

INSERT INTO aggregator_providers
    (name, display_name, provider_type, priority, is_enabled, status, supported_regions, capabilities)
VALUES
    ('plaid', 'Plaid', 'aggregator', 0, true, 'active',
     '["US", "CA", "GB", "IE", "FR", "ES", "NL"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": true, "investments": true}'::jsonb),
    ('mx', 'MX', 'aggregator', 1, true, 'active',
     '["US", "CA"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": true}'::jsonb),
    ('truelayer', 'TrueLayer', 'open_banking', 12, false, 'maintenance',
     '["GB", "IE", "FR", "ES", "IT", "DE", "PT", "NL", "LT"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": false}'::jsonb),
    ('finicity', 'Finicity (Mastercard)', 'aggregator', 13, false, 'maintenance',
     '["US", "CA"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": true}'::jsonb)
ON CONFLICT (name) DO UPDATE SET
    display_name      = EXCLUDED.display_name,
    provider_type     = EXCLUDED.provider_type,
    priority          = EXCLUDED.priority,
    is_enabled        = EXCLUDED.is_enabled,
    status            = EXCLUDED.status,
    supported_regions = EXCLUDED.supported_regions,
    capabilities      = EXCLUDED.capabilities,
    updated_at        = now();
