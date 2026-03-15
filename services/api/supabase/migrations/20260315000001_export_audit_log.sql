-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260315000001_export_audit_log
-- Description: Audit log for data export events (privacy compliance, #353)
--
-- This table records every data export request for GDPR/CCPA compliance
-- and enables rate limiting (max 10 exports per user per hour).
--
-- Security:
--   - RLS enabled: users can only view their own export logs
--   - Inserts are performed via service role (Edge Function)
--   - error_message is sanitized server-side (never contains raw internals)

CREATE TABLE IF NOT EXISTS data_export_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    export_format TEXT NOT NULL CHECK (export_format IN ('json', 'csv')),
    account_count INTEGER NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    category_count INTEGER NOT NULL DEFAULT 0,
    budget_count INTEGER NOT NULL DEFAULT 0,
    goal_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
    error_message TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only see their own export logs
ALTER TABLE data_export_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own export logs"
    ON data_export_audit_log FOR SELECT
    USING (auth.uid() = user_id);

-- Index for rate limiting queries (user + time range lookups)
CREATE INDEX idx_export_audit_user_created
    ON data_export_audit_log (user_id, created_at DESC);
