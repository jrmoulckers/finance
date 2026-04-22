-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260327000002_bank_connections
-- Description: Drop bank connection tables, RLS policies, and triggers
-- Issues: #265

-- Drop triggers
DROP TRIGGER IF EXISTS trg_bank_connection_accounts_updated_at ON bank_connection_accounts;
DROP TRIGGER IF EXISTS trg_bank_connections_updated_at ON bank_connections;

-- Drop RLS policies
DROP POLICY IF EXISTS bank_sync_log_select ON bank_sync_log;
DROP POLICY IF EXISTS bank_connection_accounts_update ON bank_connection_accounts;
DROP POLICY IF EXISTS bank_connection_accounts_insert ON bank_connection_accounts;
DROP POLICY IF EXISTS bank_connection_accounts_select ON bank_connection_accounts;
DROP POLICY IF EXISTS bank_connections_delete ON bank_connections;
DROP POLICY IF EXISTS bank_connections_update ON bank_connections;
DROP POLICY IF EXISTS bank_connections_insert ON bank_connections;
DROP POLICY IF EXISTS bank_connections_select ON bank_connections;

-- Disable RLS
ALTER TABLE bank_sync_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connection_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connections DISABLE ROW LEVEL SECURITY;

-- Drop tables (order matters due to FKs)
DROP TABLE IF EXISTS bank_sync_log;
DROP TABLE IF EXISTS bank_connection_accounts;
DROP TABLE IF EXISTS bank_connections;
