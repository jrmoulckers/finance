-- SPDX-License-Identifier: BUSL-1.1
-- Migration: 20260329000003_rate_limit_enhancement (#1103)
-- Up
CREATE TABLE rate_limit_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL, blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL, reason TEXT NOT NULL DEFAULT 'rate_limit_exceeded',
    request_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_rate_limit_blocks_key UNIQUE (key)
);
CREATE INDEX idx_rate_limit_blocks_expires ON rate_limit_blocks (expires_at);
ALTER TABLE rate_limit_blocks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit_enhanced(p_key TEXT, p_max_requests INTEGER, p_window_seconds INTEGER, p_burst_limit INTEGER DEFAULT NULL, p_block_seconds INTEGER DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result RECORD; v_window_interval INTERVAL; v_remaining INTEGER; v_reset_at TIMESTAMPTZ; v_is_blocked BOOLEAN := false; v_block_expires TIMESTAMPTZ; v_effective_burst INTEGER;
BEGIN
    SELECT true, rlb.expires_at INTO v_is_blocked, v_block_expires FROM rate_limit_blocks rlb WHERE rlb.key = p_key AND rlb.expires_at > now();
    IF v_is_blocked THEN RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'reset_at', v_block_expires, 'current_count', p_max_requests, 'blocked', true, 'block_reason', 'rate_limit_block'); END IF;
    v_window_interval := make_interval(secs => p_window_seconds); v_effective_burst := COALESCE(p_burst_limit, p_max_requests * 2);
    INSERT INTO rate_limits (key, window_start, request_count) VALUES (p_key, now(), 1) ON CONFLICT (key) DO UPDATE SET request_count = CASE WHEN rate_limits.window_start + v_window_interval < now() THEN 1 ELSE rate_limits.request_count + 1 END, window_start = CASE WHEN rate_limits.window_start + v_window_interval < now() THEN now() ELSE rate_limits.window_start END RETURNING request_count, window_start INTO v_result;
    v_remaining := GREATEST(0, p_max_requests - v_result.request_count); v_reset_at := v_result.window_start + v_window_interval;
    IF v_result.request_count > v_effective_burst THEN
        INSERT INTO rate_limit_blocks (key, expires_at, reason, request_count) VALUES (p_key, now() + make_interval(secs => p_block_seconds), 'burst_limit_exceeded', v_result.request_count) ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at, request_count = EXCLUDED.request_count;
        RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'reset_at', now() + make_interval(secs => p_block_seconds), 'current_count', v_result.request_count, 'blocked', true, 'block_reason', 'burst_limit_exceeded');
    END IF;
    RETURN jsonb_build_object('allowed', v_result.request_count <= p_max_requests, 'remaining', v_remaining, 'reset_at', v_reset_at, 'current_count', v_result.request_count, 'blocked', false, 'block_reason', NULL);
END; $$;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_enhanced(TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_enhanced(TEXT, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limit_blocks() RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted INTEGER;
BEGIN DELETE FROM rate_limit_blocks WHERE expires_at < now(); GET DIAGNOSTICS v_deleted = ROW_COUNT; RETURN v_deleted; END; $$;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limit_blocks() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limit_blocks() FROM PUBLIC;
