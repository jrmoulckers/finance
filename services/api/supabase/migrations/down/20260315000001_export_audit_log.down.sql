-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260315000001_export_audit_log
-- Description: Drop data_export_audit_log table
-- Issues: #893

DROP POLICY IF EXISTS "Users can view own export logs" ON data_export_audit_log;
ALTER TABLE data_export_audit_log DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS data_export_audit_log;
