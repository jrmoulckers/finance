-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260330000005_audit_log_retention
-- Description: Reverse automated audit_log retention purge added by the up migration
-- Issues: #1312, #2881
--
-- Reversal of services/api/supabase/migrations/20260330000005_audit_log_retention.sql.
--
-- The up migration:
--   1. Added cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
--      (a NEW single-argument overload; the 3-argument overload from
--      20260325000001 is unaffected).
--   2. Replaced run_all_maintenance() to also call the new single-arg purge.
--   3. Scheduled a weekly pg_cron job 'cleanup-audit-logs'.
--
-- This down migration:
--   1. Unschedules the 'cleanup-audit-logs' pg_cron job.
--   2. Restores run_all_maintenance() to its IMMEDIATELY-PRIOR definition,
--      which is the 20260325000001 version (soft-delete purge + 3-arg audit
--      cleanup). NOTE: the inline DOWN comment in the up file restores an
--      older 20260324000003 variant — that would be incorrect because it
--      drops the soft-delete/audit cleanup that existed before this migration.
--   3. Drops ONLY the single-argument cleanup_old_audit_logs(INTEGER) overload.
--      The 3-argument overload remains so run_all_maintenance() resolves
--      cleanup_old_audit_logs() unambiguously again.
--
-- NOTE: audit_log rows already hard-deleted by the purge job/function are not
-- recoverable; this reversal only removes the scheduled purge, it cannot
-- restore previously deleted rows.

-- =============================================================================
-- 1. Remove the weekly pg_cron job (if pg_cron is installed)
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('cleanup-audit-logs');
    END IF;
END $$;

-- =============================================================================
-- 2. Restore run_all_maintenance() to its immediately-prior (20260325000001)
--    definition WITHOUT the single-arg audit log purge.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.run_all_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate_limits      INTEGER;
    v_webauthn         INTEGER;
    v_sync_logs        INTEGER;
    v_invitations      INTEGER;
    v_soft_deleted     JSONB;
    v_audit_cleanup    JSONB;
    v_analyze_result   TEXT;
BEGIN
    -- Existing cleanups (from 20260324000003)
    v_rate_limits    := cleanup_expired_rate_limits();
    v_webauthn       := cleanup_expired_webauthn_challenges();
    v_sync_logs      := cleanup_old_sync_health_logs();
    v_invitations    := cleanup_expired_invitations();

    -- Cleanups added in 20260325000001 (#609)
    v_soft_deleted   := cleanup_soft_deleted_records();
    v_audit_cleanup  := cleanup_old_audit_logs();

    -- Update planner statistics
    v_analyze_result := vacuum_analyze_tables();

    RETURN jsonb_build_object(
        'rate_limits_deleted',          v_rate_limits,
        'webauthn_challenges_deleted',  v_webauthn,
        'sync_health_logs_deleted',     v_sync_logs,
        'invitations_expired',          v_invitations,
        'soft_deleted_purge',           v_soft_deleted,
        'audit_log_cleanup',            v_audit_cleanup,
        'analyze_result',               v_analyze_result,
        'completed_at',                 NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;

-- =============================================================================
-- 3. Drop ONLY the single-argument audit log cleanup overload added by the up.
--    The 3-argument cleanup_old_audit_logs(INTEGER, INTEGER, INTEGER) from
--    20260325000001 is intentionally left in place.
-- =============================================================================
DROP FUNCTION IF EXISTS public.cleanup_old_audit_logs(INTEGER);
