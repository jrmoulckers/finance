-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260324000003_automated_maintenance
-- Description: Automated database maintenance functions and pg_cron scheduling
-- Issues: #686
--
-- Creates fine-grained maintenance functions for each cleanup concern and an
-- orchestrator function that calls them all. Complements the existing
-- cleanup_expired_records() from 20260323000001 with:
--   - Individual functions for granular scheduling and monitoring
--   - Configurable retention periods via function parameters
--   - ANALYZE scheduling for query planner accuracy
--   - pg_cron integration (guarded — only activates if pg_cron is installed)
--
-- Security:
--   - All functions are SECURITY DEFINER to bypass RLS for maintenance
--   - EXECUTE granted only to service_role; revoked from PUBLIC and anon
--   - Functions use SET search_path = public to prevent search_path injection
--
-- Note: cleanup_expired_rate_limits replaces the version from 20260323000003
-- with an hours-based interface (was seconds-based). The signature (INTEGER)
-- is identical, so CREATE OR REPLACE succeeds.

-- =============================================================================
-- 1. cleanup_expired_rate_limits(retention_hours INTEGER DEFAULT 2)
-- =============================================================================
-- Removes rate limit counter rows whose window has expired beyond the
-- retention period. The rate_limits table uses window_start; expiry is
-- computed as window_start + configured interval. After the window passes
-- plus the retention buffer, the row is stale and safe to delete.
--
-- Default retention: 2 hours (well beyond the longest window of 1 hour
-- used by data-export / account-deletion / sync-health-report).
--
-- Replaces: cleanup_expired_rate_limits(p_retention_seconds) from migration
-- 20260323000003_rate_limits.sql — same signature (INTEGER), new semantics.

CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits(
    retention_hours INTEGER DEFAULT 2
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
    WHERE window_start < NOW() - (retention_hours || ' hours')::INTERVAL;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) FROM anon;


-- =============================================================================
-- 2. cleanup_expired_webauthn_challenges(retention_hours INTEGER DEFAULT 1)
-- =============================================================================
-- Hard-deletes WebAuthn challenge rows that expired beyond the retention
-- period. Challenges have a 5-minute TTL; the 1-hour default retention
-- provides a generous safety margin for in-flight authentication ceremonies.
--
-- Complements: cleanup_expired_records() which also cleans challenges,
-- but this function provides independent scheduling and monitoring.

CREATE OR REPLACE FUNCTION public.cleanup_expired_webauthn_challenges(
    retention_hours INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM webauthn_challenges
    WHERE expires_at < NOW() - (retention_hours || ' hours')::INTERVAL;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_webauthn_challenges(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_webauthn_challenges(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_webauthn_challenges(INTEGER) FROM anon;


-- =============================================================================
-- 3. cleanup_old_sync_health_logs(retention_days INTEGER DEFAULT 30)
-- =============================================================================
-- Hard-deletes sync health log entries older than the retention period.
-- These logs are append-only diagnostics; 30 days is sufficient for
-- trend analysis and debugging. Keeps the table size manageable.
--
-- At typical write rates (~100 syncs/user/day, 1000 users), this removes
-- ~3M rows per run, reclaiming significant disk space.

CREATE OR REPLACE FUNCTION public.cleanup_old_sync_health_logs(
    retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM sync_health_logs
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_sync_health_logs(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_sync_health_logs(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_sync_health_logs(INTEGER) FROM anon;


-- =============================================================================
-- 4. cleanup_expired_invitations()
-- =============================================================================
-- Soft-deletes household invitations that have expired without being accepted.
-- Unlike cleanup_expired_records() which hard-deletes old invitations, this
-- function marks freshly expired ones as deleted so they stop appearing in
-- household invitation lists while preserving them for audit purposes.
--
-- Only targets invitations that are:
--   - Past their expires_at timestamp
--   - Never accepted (accepted_at IS NULL)
--   - Not already soft-deleted (deleted_at IS NULL)

CREATE OR REPLACE FUNCTION public.cleanup_expired_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE household_invitations
    SET deleted_at = NOW()
    WHERE expires_at < NOW()
      AND accepted_at IS NULL
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_invitations() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_invitations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_invitations() FROM anon;


-- =============================================================================
-- 5. vacuum_analyze_tables()
-- =============================================================================
-- Runs ANALYZE on the most frequently updated tables to keep the query
-- planner's statistics accurate. This does NOT run VACUUM — that is handled
-- by PostgreSQL's autovacuum or can be scheduled separately via pg_cron.
--
-- ANALYZE is lightweight and non-blocking. It samples table data to update
-- the pg_statistic catalog, improving query plan accuracy for:
--   - Index selection (which index to use)
--   - Join ordering (which table to scan first)
--   - Row count estimates (affects nested loop vs hash join choice)
--
-- Tables analyzed (ordered by update frequency):
--   1. transactions  — highest write volume
--   2. accounts      — balance recalculated on every transaction
--   3. budgets       — updated during budget tracking
--   4. goals         — updated on savings progress
--   5. sync_health_logs — append-only but high volume
--   6. rate_limits   — high-frequency UPSERT from Edge Functions

CREATE OR REPLACE FUNCTION public.vacuum_analyze_tables()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'transactions',
        'accounts',
        'budgets',
        'goals',
        'sync_health_logs',
        'rate_limits'
    ];
    v_table TEXT;
    v_summary TEXT := '';
BEGIN
    FOREACH v_table IN ARRAY v_tables
    LOOP
        EXECUTE format('ANALYZE %I', v_table);
        v_summary := v_summary || 'ANALYZE ' || v_table || ' OK; ';
    END LOOP;

    RETURN v_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vacuum_analyze_tables() TO service_role;
REVOKE EXECUTE ON FUNCTION public.vacuum_analyze_tables() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vacuum_analyze_tables() FROM anon;


-- =============================================================================
-- 6. run_all_maintenance()
-- =============================================================================
-- Orchestrator function that calls all cleanup functions and ANALYZE.
-- Returns a JSONB summary with counts from each cleanup, the ANALYZE result,
-- and a timestamp. Designed to be called by pg_cron daily or via an Edge
-- Function for on-demand maintenance.
--
-- Example return value:
--   {
--     "rate_limits_deleted": 42,
--     "webauthn_challenges_deleted": 7,
--     "sync_health_logs_deleted": 150000,
--     "invitations_expired": 3,
--     "analyze_result": "ANALYZE transactions OK; ANALYZE accounts OK; ...",
--     "completed_at": "2026-03-24T03:00:01.234Z"
--   }

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
    v_analyze_result TEXT;
BEGIN
    -- Run each cleanup with default retention periods
    v_rate_limits    := cleanup_expired_rate_limits();
    v_webauthn       := cleanup_expired_webauthn_challenges();
    v_sync_logs      := cleanup_old_sync_health_logs();
    v_invitations    := cleanup_expired_invitations();

    -- Update planner statistics
    v_analyze_result := vacuum_analyze_tables();

    RETURN jsonb_build_object(
        'rate_limits_deleted',          v_rate_limits,
        'webauthn_challenges_deleted',  v_webauthn,
        'sync_health_logs_deleted',     v_sync_logs,
        'invitations_expired',          v_invitations,
        'analyze_result',               v_analyze_result,
        'completed_at',                 NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_all_maintenance() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_all_maintenance() FROM anon;


-- =============================================================================
-- 7. pg_cron scheduling (conditional — only if pg_cron extension is installed)
-- =============================================================================
-- Supabase Pro plans include pg_cron; free-tier and local dev do not.
-- The DO block checks for the extension before scheduling to avoid errors.
--
-- Schedule:
--   - Every hour: cleanup rate limits and webauthn challenges (lightweight)
--   - Daily at 3 AM UTC: full maintenance run (cleanup + ANALYZE)
--
-- To verify scheduled jobs after migration:
--   SELECT * FROM cron.job ORDER BY jobid;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Hourly: clean up expired rate limit windows (fast, <10ms typical)
        PERFORM cron.schedule(
            'cleanup-rate-limits',
            '0 * * * *',
            $$SELECT public.cleanup_expired_rate_limits()$$
        );

        -- Hourly: clean up expired WebAuthn challenges (fast, <10ms typical)
        PERFORM cron.schedule(
            'cleanup-webauthn',
            '0 * * * *',
            $$SELECT public.cleanup_expired_webauthn_challenges()$$
        );

        -- Daily at 3 AM UTC: full maintenance (cleanup all + ANALYZE)
        PERFORM cron.schedule(
            'daily-maintenance',
            '0 3 * * *',
            $$SELECT public.run_all_maintenance()$$
        );

        RAISE NOTICE 'pg_cron jobs scheduled: cleanup-rate-limits, cleanup-webauthn, daily-maintenance';
    ELSE
        RAISE NOTICE 'pg_cron not available — skipping cron schedule. Use Edge Functions or external scheduler.';
    END IF;
END $$;


-- =============================================================================
-- Down migration (to revert this migration)
-- =============================================================================
--
-- -- Remove pg_cron jobs (if pg_cron is installed)
-- DO $$
-- BEGIN
--     IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--         PERFORM cron.unschedule('cleanup-rate-limits');
--         PERFORM cron.unschedule('cleanup-webauthn');
--         PERFORM cron.unschedule('daily-maintenance');
--     END IF;
-- END $$;
--
-- -- Drop new maintenance functions
-- DROP FUNCTION IF EXISTS public.run_all_maintenance();
-- DROP FUNCTION IF EXISTS public.vacuum_analyze_tables();
-- DROP FUNCTION IF EXISTS public.cleanup_expired_invitations();
-- DROP FUNCTION IF EXISTS public.cleanup_old_sync_health_logs(INTEGER);
-- DROP FUNCTION IF EXISTS public.cleanup_expired_webauthn_challenges(INTEGER);
--
-- -- Restore original cleanup_expired_rate_limits with seconds-based interface
-- CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits(
--     p_retention_seconds INTEGER DEFAULT 7200
-- )
-- RETURNS INTEGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--     v_deleted INTEGER;
-- BEGIN
--     DELETE FROM rate_limits
--     WHERE window_start < now() - make_interval(secs => p_retention_seconds);
--     GET DIAGNOSTICS v_deleted = ROW_COUNT;
--     RETURN v_deleted;
-- END;
-- $$;
-- GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) TO service_role;
-- REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) FROM PUBLIC;
-- REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) FROM anon;
