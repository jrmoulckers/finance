-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260330000005_audit_log_retention
-- Description: Add automated audit_log retention purge and enhance maintenance
-- Issues: #1312
--
-- Gap identified in 20260324000003_automated_maintenance:
--   - WebAuthn challenge purge: ✅ already covered (hourly via pg_cron)
--   - Household invitation expiry: ✅ already covered (soft-delete via deleted_at)
--   - Audit log retention (90 days): ❌ NOT covered — added by this migration
--
-- This migration adds:
--   1. cleanup_old_audit_logs() — hard-deletes audit_log rows older than 90 days
--   2. Updates run_all_maintenance() to include audit log cleanup
--   3. Schedules weekly pg_cron job for audit log retention (heavier operation)
--
-- Security:
--   - SECURITY DEFINER to bypass RLS for maintenance
--   - EXECUTE granted only to service_role; revoked from PUBLIC and anon
--   - SET search_path = public to prevent search_path injection

-- =============================================================================
-- Up Migration
-- =============================================================================

-- =============================================================================
-- 1. cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
-- =============================================================================
-- Hard-deletes audit_log entries older than the retention period.
-- 90-day default aligns with typical GDPR/CCPA data retention requirements.
--
-- Uses a batch-delete approach with a LIMIT to avoid long-running transactions
-- on large tables. The function deletes up to 10,000 rows per call; pg_cron
-- will invoke it repeatedly until fully caught up.
--
-- The audit_log table has an index on created_at (idx_audit_log_created_at)
-- from 20260306000003, ensuring this DELETE uses an index scan.

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(
    retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM audit_log
    WHERE id IN (
        SELECT id FROM audit_log
        WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
        LIMIT 10000
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER) FROM anon;


-- =============================================================================
-- 2. Update run_all_maintenance() to include audit log cleanup
-- =============================================================================
-- Replaces the orchestrator from 20260324000003 to add audit_log purge.

CREATE OR REPLACE FUNCTION public.run_all_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate_limits    INTEGER;
    v_webauthn       INTEGER;
    v_sync_logs      INTEGER;
    v_invitations    INTEGER;
    v_audit_logs     INTEGER;
    v_analyze_result TEXT;
BEGIN
    -- Run each cleanup with default retention periods
    v_rate_limits    := cleanup_expired_rate_limits();
    v_webauthn       := cleanup_expired_webauthn_challenges();
    v_sync_logs      := cleanup_old_sync_health_logs();
    v_invitations    := cleanup_expired_invitations();
    v_audit_logs     := cleanup_old_audit_logs();

    -- Update planner statistics
    v_analyze_result := vacuum_analyze_tables();

    RETURN jsonb_build_object(
        'rate_limits_deleted',          v_rate_limits,
        'webauthn_challenges_deleted',  v_webauthn,
        'sync_health_logs_deleted',     v_sync_logs,
        'invitations_expired',          v_invitations,
        'audit_logs_deleted',           v_audit_logs,
        'analyze_result',               v_analyze_result,
        'completed_at',                 NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;


-- =============================================================================
-- 3. pg_cron: weekly audit log retention job
-- =============================================================================
-- Audit log cleanup is heavier than WebAuthn/rate-limit cleanup, so we
-- schedule it weekly (Sunday 4 AM UTC) rather than hourly. The daily
-- run_all_maintenance() at 3 AM also calls it, but the dedicated weekly
-- job ensures catch-up if daily runs miss rows due to the 10k batch limit.

DO $maint$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'cleanup-audit-logs',
            '0 4 * * 0',
            $$SELECT public.cleanup_old_audit_logs()$$
        );

        RAISE NOTICE 'pg_cron job scheduled: cleanup-audit-logs (weekly Sunday 4 AM UTC)';
    ELSE
        RAISE NOTICE 'pg_cron not available — skipping audit log cron schedule.';
    END IF;
END $maint$;


-- =============================================================================
-- Down Migration
-- =============================================================================
-- To revert this migration, run the following SQL:
--
-- -- Remove the pg_cron job
-- DO $$
-- BEGIN
--     IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--         PERFORM cron.unschedule('cleanup-audit-logs');
--     END IF;
-- END $$;
--
-- -- Restore run_all_maintenance() WITHOUT audit log cleanup
-- CREATE OR REPLACE FUNCTION public.run_all_maintenance()
-- RETURNS JSONB
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--     v_rate_limits    INTEGER;
--     v_webauthn       INTEGER;
--     v_sync_logs      INTEGER;
--     v_invitations    INTEGER;
--     v_analyze_result TEXT;
-- BEGIN
--     v_rate_limits    := cleanup_expired_rate_limits();
--     v_webauthn       := cleanup_expired_webauthn_challenges();
--     v_sync_logs      := cleanup_old_sync_health_logs();
--     v_invitations    := cleanup_expired_invitations();
--     v_analyze_result := vacuum_analyze_tables();
--
--     RETURN jsonb_build_object(
--         'rate_limits_deleted',          v_rate_limits,
--         'webauthn_challenges_deleted',  v_webauthn,
--         'sync_health_logs_deleted',     v_sync_logs,
--         'invitations_expired',          v_invitations,
--         'analyze_result',               v_analyze_result,
--         'completed_at',                 NOW()
--     );
-- END;
-- $$;
--
-- GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
-- REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
-- REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;
--
-- -- Drop the audit log cleanup function
-- DROP FUNCTION IF EXISTS public.cleanup_old_audit_logs(INTEGER);
