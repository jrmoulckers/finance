-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260323000003_rate_limits
-- Description: Lightweight rate limiting table and atomic check-and-increment RPC
-- Issue: #614
--
-- Changes:
--   1. Create rate_limits table for sliding-window counters
--   2. Create check_rate_limit RPC for atomic UPSERT + check
--   3. Create cleanup_expired_rate_limits for periodic garbage collection
--
-- Design notes:
--   - One row per (function, identifier) pair; no per-request rows
--   - UPSERT resets the counter when the window expires, so a single row
--     tracks the current window without needing historical data
--   - RLS is enabled but no policies are added — only service_role accesses
--     this table via the SECURITY DEFINER RPC

-- =============================================================================
-- 1. Rate limits table
-- =============================================================================

CREATE TABLE rate_limits (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    key             TEXT         NOT NULL,
    window_start    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    request_count   INTEGER      NOT NULL DEFAULT 1,
    CONSTRAINT uq_rate_limits_key UNIQUE (key)
);

COMMENT ON TABLE rate_limits IS 'Sliding-window rate limit counters for Edge Functions (#614)';
COMMENT ON COLUMN rate_limits.key IS 'Composite key: "<function>:<identifier>" (e.g. "health-check:1.2.3.4")';
COMMENT ON COLUMN rate_limits.window_start IS 'Start of the current rate limit window';
COMMENT ON COLUMN rate_limits.request_count IS 'Number of requests in the current window';

-- Index on window_start for efficient cleanup of expired windows
CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);

-- Enable RLS — no policies needed (service_role only via SECURITY DEFINER)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Atomic check-and-increment RPC
-- =============================================================================
-- Uses INSERT ... ON CONFLICT DO UPDATE to atomically:
--   a) Create a new counter if none exists for this key
--   b) Increment an existing counter if within the current window
--   c) Reset the counter if the window has expired
--
-- Returns a jsonb object with:
--   allowed      — whether the request is within the limit
--   remaining    — how many requests remain in the window
--   reset_at     — when the current window expires (ISO 8601)
--   current_count — the updated request count

CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key            TEXT,
    p_max_requests   INTEGER,
    p_window_seconds INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result          RECORD;
    v_window_interval INTERVAL;
    v_remaining       INTEGER;
    v_reset_at        TIMESTAMPTZ;
BEGIN
    v_window_interval := make_interval(secs => p_window_seconds);

    INSERT INTO rate_limits (key, window_start, request_count)
    VALUES (p_key, now(), 1)
    ON CONFLICT (key) DO UPDATE
    SET request_count = CASE
            WHEN rate_limits.window_start + v_window_interval < now()
            THEN 1
            ELSE rate_limits.request_count + 1
        END,
        window_start = CASE
            WHEN rate_limits.window_start + v_window_interval < now()
            THEN now()
            ELSE rate_limits.window_start
        END
    RETURNING request_count, window_start INTO v_result;

    v_remaining := GREATEST(0, p_max_requests - v_result.request_count);
    v_reset_at  := v_result.window_start + v_window_interval;

    RETURN jsonb_build_object(
        'allowed',       v_result.request_count <= p_max_requests,
        'remaining',     v_remaining,
        'reset_at',      v_reset_at,
        'current_count', v_result.request_count
    );
END;
$$;

-- Only service_role may invoke this function
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon;

-- =============================================================================
-- 3. Cleanup function for expired rate limit windows
-- =============================================================================
-- Called periodically (e.g. by a cron job or the existing cleanup_expired_records
-- function) to remove stale rows and keep the table small.
--
-- Default retention: 2 hours — well beyond the longest window (1 hour for
-- data-export / account-deletion / sync-health-report).

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

GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(integer) FROM anon;
