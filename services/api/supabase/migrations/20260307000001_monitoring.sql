-- SPDX-License-Identifier: BUSL-1.1

-- Monitoring: server-side sync health logging
-- Refs: #84, #85
-- Records sync health metrics reported by clients, enabling server-side
-- analysis of sync performance and reliability across the user base.

-- Sync health logs table
CREATE TABLE IF NOT EXISTS public.sync_health_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id       TEXT NOT NULL,
    sync_duration_ms BIGINT NOT NULL,
    record_count    INTEGER NOT NULL DEFAULT 0,
    error_code      TEXT,
    error_message   TEXT,
    sync_status     TEXT NOT NULL CHECK (sync_status IN ('success', 'failure', 'partial')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sync_health_logs IS 'Server-side sync performance metrics reported by clients.';
COMMENT ON COLUMN public.sync_health_logs.device_id IS 'Pseudonymous device identifier (rotatable, not a hardware ID).';
COMMENT ON COLUMN public.sync_health_logs.sync_duration_ms IS 'Total sync round-trip time in milliseconds.';
COMMENT ON COLUMN public.sync_health_logs.error_code IS 'Machine-readable error code for failed syncs (null on success).';
COMMENT ON COLUMN public.sync_health_logs.error_message IS 'Sanitized error description -- must not contain PII or financial data.';
COMMENT ON COLUMN public.sync_health_logs.sync_status IS 'Outcome of the sync operation: success, failure, or partial.';

-- Index for querying a user's recent sync history
CREATE INDEX idx_sync_health_logs_user_created
    ON public.sync_health_logs (user_id, created_at DESC);

-- Index for server-side aggregate queries (overall health dashboard)
CREATE INDEX idx_sync_health_logs_status_created
    ON public.sync_health_logs (sync_status, created_at DESC);

-- Enable Row-Level Security
ALTER TABLE public.sync_health_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can read their own sync health logs
CREATE POLICY sync_health_logs_select_own
    ON public.sync_health_logs
    FOR SELECT
    USING (user_id = auth.uid());

-- RLS policy: only the service role (system) can insert sync health logs.
-- Client writes go through an Edge Function that validates and inserts
-- using the service role, preventing clients from spoofing metrics.
CREATE POLICY sync_health_logs_insert_service
    ON public.sync_health_logs
    FOR INSERT
    WITH CHECK (
        (current_setting('role', true)) = 'service_role'
    );

-- RLS policy: no direct updates -- logs are append-only
-- (No UPDATE or DELETE policies are defined, making logs immutable via RLS.)
