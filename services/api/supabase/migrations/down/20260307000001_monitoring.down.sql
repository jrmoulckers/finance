-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260307000001_monitoring
-- Description: Drop sync_health_logs table
-- Issues: #893

DROP POLICY IF EXISTS sync_health_logs_insert_service ON sync_health_logs;
DROP POLICY IF EXISTS sync_health_logs_select_own ON sync_health_logs;
ALTER TABLE sync_health_logs DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS sync_health_logs;
