-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260324000003_automated_maintenance
-- Description: Drop automated maintenance functions and pg_cron jobs
-- Issues: #893

-- =============================================================================
-- Remove pg_cron jobs (if pg_cron is installed)
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('cleanup-rate-limits');
        PERFORM cron.unschedule('cleanup-webauthn');
        PERFORM cron.unschedule('daily-maintenance');
    END IF;
END $$;

-- =============================================================================
-- Drop new maintenance functions
-- =============================================================================
DROP FUNCTION IF EXISTS public.run_all_maintenance();
DROP FUNCTION IF EXISTS public.vacuum_analyze_tables();
DROP FUNCTION IF EXISTS public.cleanup_expired_invitations();
DROP FUNCTION IF EXISTS public.cleanup_old_sync_health_logs(INTEGER);
DROP FUNCTION IF EXISTS public.cleanup_expired_webauthn_challenges(INTEGER);

-- =============================================================================
-- Restore original cleanup_expired_rate_limits with seconds-based interface
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits(
    p_retention_seconds INTEGER DEFAULT 7200
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM rate_limits
    WHERE window_start < now() - make_interval(secs => p_retention_seconds);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) FROM anon;
