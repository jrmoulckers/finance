-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260325000001_read_only_rate_limit_status
-- Description: Add read-only rate limit status RPC for abuse detection (#781)
-- Issue: #781
--
-- Changes:
--   1. Create get_rate_limit_status RPC — reads current counter without incrementing
--
-- Design notes:
--   - The existing check_rate_limit RPC always increments the counter (atomic
--     UPSERT), which is correct for rate limiting but wrong for abuse status
--     checks. checkAbuseStatus() needs to read the current count to decide
--     whether a client is blocked, WITHOUT inflating the counter.
--   - This function performs a simple SELECT — no INSERT, no UPDATE.
--   - If no row exists for the key, it returns current_count = 0 (not blocked).
--   - If the row's window has expired, it also returns current_count = 0.
--   - SECURITY DEFINER with restricted search_path, same as check_rate_limit.

-- =============================================================================
-- 1. Read-only rate limit status RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_rate_limit_status(
    p_key            TEXT,
    p_window_seconds INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row             RECORD;
    v_window_interval INTERVAL;
    v_current_count   INTEGER;
    v_reset_at        TIMESTAMPTZ;
BEGIN
    v_window_interval := make_interval(secs => p_window_seconds);

    SELECT request_count, window_start
    INTO v_row
    FROM rate_limits
    WHERE key = p_key;

    -- No row exists: never been rate-limited for this key
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'current_count', 0,
            'reset_at',      now() + v_window_interval
        );
    END IF;

    -- Window has expired: counter is effectively zero
    IF v_row.window_start + v_window_interval < now() THEN
        RETURN jsonb_build_object(
            'current_count', 0,
            'reset_at',      now() + v_window_interval
        );
    END IF;

    -- Window is still active: return current count
    v_reset_at := v_row.window_start + v_window_interval;

    RETURN jsonb_build_object(
        'current_count', v_row.request_count,
        'reset_at',      v_reset_at
    );
END;
$$;

-- Only service_role may invoke this function
GRANT EXECUTE ON FUNCTION public.get_rate_limit_status(text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_rate_limit_status(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_rate_limit_status(text, integer) FROM anon;
