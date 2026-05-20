-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260331000001_bank_connectivity_foundation
-- Reverts: Bank connectivity infrastructure
-- Issues: #1575, #1577, #1580, #1583, #1586, #1602

-- =============================================================================
-- Remove transaction provenance columns
-- =============================================================================

DROP INDEX IF EXISTS idx_transactions_duplicate_detection;
DROP INDEX IF EXISTS idx_transactions_import_job;
DROP INDEX IF EXISTS idx_transactions_provider_txn_id;
DROP INDEX IF EXISTS idx_transactions_source;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_confidence_range;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_source_valid;
ALTER TABLE transactions DROP COLUMN IF EXISTS imported_at;
ALTER TABLE transactions DROP COLUMN IF EXISTS confidence_score;
ALTER TABLE transactions DROP COLUMN IF EXISTS provider_transaction_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS import_job_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS import_source_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS posted_date;
ALTER TABLE transactions DROP COLUMN IF EXISTS authorized_date;
ALTER TABLE transactions DROP COLUMN IF EXISTS source;

-- =============================================================================
-- Revert import_jobs changes
-- =============================================================================

ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_dup_strategy_valid;
ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_source_valid;
ALTER TABLE import_jobs DROP COLUMN IF EXISTS duplicate_strategy;
ALTER TABLE import_jobs DROP COLUMN IF EXISTS original_file_hash;
ALTER TABLE import_jobs DROP COLUMN IF EXISTS source_type;

ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_format_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_format_check
    CHECK (format IN ('generic', 'mint', 'ynab'));

-- =============================================================================
-- Revert bank_connections changes
-- =============================================================================

ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_conn_type_valid;
ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_permission_valid;
ALTER TABLE bank_connections DROP COLUMN IF EXISTS connection_type;
ALTER TABLE bank_connections DROP COLUMN IF EXISTS permission_level;
ALTER TABLE bank_connections DROP COLUMN IF EXISTS staleness_threshold_hours;
ALTER TABLE bank_connections DROP COLUMN IF EXISTS failover_provider_id;
ALTER TABLE bank_connections DROP COLUMN IF EXISTS aggregator_provider_id;

ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_provider_valid;
ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_provider_valid
    CHECK (provider IN ('plaid', 'mx'));

-- =============================================================================
-- Drop triggers
-- =============================================================================

DROP TRIGGER IF EXISTS trg_open_banking_connections_updated_at ON open_banking_connections;
DROP TRIGGER IF EXISTS trg_connector_permissions_updated_at ON connector_permissions;
DROP TRIGGER IF EXISTS trg_aggregator_providers_updated_at ON aggregator_providers;

-- =============================================================================
-- Drop RLS policies
-- =============================================================================

DROP POLICY IF EXISTS ob_connections_update ON open_banking_connections;
DROP POLICY IF EXISTS ob_connections_insert ON open_banking_connections;
DROP POLICY IF EXISTS ob_connections_select ON open_banking_connections;
DROP POLICY IF EXISTS connector_access_log_select ON connector_access_log;
DROP POLICY IF EXISTS connector_permissions_update ON connector_permissions;
DROP POLICY IF EXISTS connector_permissions_insert ON connector_permissions;
DROP POLICY IF EXISTS connector_permissions_select ON connector_permissions;
DROP POLICY IF EXISTS bank_connection_health_select ON bank_connection_health;
DROP POLICY IF EXISTS aggregator_providers_select ON aggregator_providers;

-- =============================================================================
-- Disable RLS and drop tables (reverse order of creation)
-- =============================================================================

ALTER TABLE open_banking_connections DISABLE ROW LEVEL SECURITY;
ALTER TABLE connector_access_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE connector_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connection_health DISABLE ROW LEVEL SECURITY;
ALTER TABLE aggregator_providers DISABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS open_banking_connections;
DROP TABLE IF EXISTS connector_access_log;
DROP TABLE IF EXISTS connector_permissions;
DROP TABLE IF EXISTS bank_connection_health;
DROP TABLE IF EXISTS aggregator_providers;
