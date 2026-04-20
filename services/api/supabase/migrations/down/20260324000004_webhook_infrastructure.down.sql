-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260324000004_webhook_infrastructure
-- Description: Drop webhook tables, triggers, and functions
-- Issues: #893
--
-- Drops in reverse dependency order: deliveries first, then endpoints,
-- then all supporting functions.

-- =============================================================================
-- Drop triggers
-- =============================================================================
DROP TRIGGER IF EXISTS trg_webhook_auto_disable ON webhook_endpoints;
DROP TRIGGER IF EXISTS trg_webhook_delivery_success ON webhook_deliveries;
DROP TRIGGER IF EXISTS trg_webhook_delivery_failure ON webhook_deliveries;
DROP TRIGGER IF EXISTS trg_webhook_endpoints_updated_at ON webhook_endpoints;

-- =============================================================================
-- Drop functions
-- =============================================================================
DROP FUNCTION IF EXISTS public.webhook_auto_disable_handler();
DROP FUNCTION IF EXISTS public.disable_failing_webhook(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.webhook_delivery_success_handler();
DROP FUNCTION IF EXISTS public.webhook_delivery_failure_handler();
DROP FUNCTION IF EXISTS public.validate_webhook_events(TEXT[]);
DROP FUNCTION IF EXISTS public.generate_webhook_secret();

-- =============================================================================
-- Drop RLS policies
-- =============================================================================

-- webhook_deliveries
DROP POLICY IF EXISTS webhook_deliveries_select ON webhook_deliveries;
ALTER TABLE webhook_deliveries DISABLE ROW LEVEL SECURITY;

-- webhook_endpoints
DROP POLICY IF EXISTS webhook_endpoints_delete ON webhook_endpoints;
DROP POLICY IF EXISTS webhook_endpoints_update ON webhook_endpoints;
DROP POLICY IF EXISTS webhook_endpoints_insert ON webhook_endpoints;
DROP POLICY IF EXISTS webhook_endpoints_select ON webhook_endpoints;
ALTER TABLE webhook_endpoints DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Drop tables (deliveries first due to FK)
-- =============================================================================
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_endpoints;
