-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260329000004_webhook_security_hardening
-- Description: Webhook security hardening — nonce tracking for replay prevention,
--              IP allowlisting for known providers
-- Issues: #1104 (Security Review: Webhook hardening)
--
-- Adds:
--   1. webhook_nonces table for replay attack prevention
--   2. webhook_ip_allowlist table for provider IP restrictions
--   3. Helper functions for nonce validation and IP checking
--   4. Cleanup for expired nonces

-- =============================================================================
-- Up
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Webhook nonces — replay attack prevention
-- -----------------------------------------------------------------------------

CREATE TABLE webhook_nonces (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce           TEXT        NOT NULL,
    provider        TEXT        NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_webhook_nonces_provider_nonce UNIQUE (provider, nonce)
);

COMMENT ON TABLE webhook_nonces IS
    'Tracks webhook delivery nonces for replay attack prevention. '
    'A nonce can only be used once per provider within its TTL.';

CREATE INDEX idx_webhook_nonces_expires ON webhook_nonces (expires_at);
CREATE INDEX idx_webhook_nonces_provider ON webhook_nonces (provider, received_at DESC);

ALTER TABLE webhook_nonces ENABLE ROW LEVEL SECURITY;
-- No policies — service_role only

-- -----------------------------------------------------------------------------
-- 2. Webhook IP allowlist
-- -----------------------------------------------------------------------------

CREATE TABLE webhook_ip_allowlist (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT        NOT NULL,
    cidr            CIDR        NOT NULL,
    description     TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_webhook_ip_provider_cidr UNIQUE (provider, cidr)
);

COMMENT ON TABLE webhook_ip_allowlist IS
    'IP allowlist for known webhook providers (Plaid, Stripe, etc.). '
    'Requests from unknown IPs are rejected.';

CREATE INDEX idx_webhook_ip_allowlist_provider
    ON webhook_ip_allowlist (provider) WHERE is_active = true;

ALTER TABLE webhook_ip_allowlist ENABLE ROW LEVEL SECURITY;
-- No policies — service_role only

-- Seed known provider IPs (Plaid and Stripe production ranges)
-- These should be verified against official documentation and updated periodically.
INSERT INTO webhook_ip_allowlist (provider, cidr, description) VALUES
    -- Stripe webhook IPs (https://stripe.com/docs/ips)
    ('stripe', '3.18.12.63/32', 'Stripe webhook US'),
    ('stripe', '3.130.192.231/32', 'Stripe webhook US'),
    ('stripe', '13.235.14.237/32', 'Stripe webhook IN'),
    ('stripe', '13.235.122.149/32', 'Stripe webhook IN'),
    ('stripe', '18.211.135.69/32', 'Stripe webhook US'),
    ('stripe', '35.154.171.200/32', 'Stripe webhook IN'),
    ('stripe', '52.15.183.38/32', 'Stripe webhook US'),
    ('stripe', '54.88.130.119/32', 'Stripe webhook US'),
    ('stripe', '54.88.130.237/32', 'Stripe webhook US'),
    ('stripe', '54.187.174.169/32', 'Stripe webhook US'),
    ('stripe', '54.187.205.235/32', 'Stripe webhook US'),
    ('stripe', '54.187.216.72/32', 'Stripe webhook US'),
    -- Plaid webhook IPs (https://plaid.com/docs/api/webhooks/)
    ('plaid', '52.21.26.131/32', 'Plaid webhook US'),
    ('plaid', '52.21.47.157/32', 'Plaid webhook US'),
    ('plaid', '52.41.247.19/32', 'Plaid webhook US'),
    ('plaid', '52.88.82.239/32', 'Plaid webhook US');

-- updated_at trigger
CREATE TRIGGER trg_webhook_ip_allowlist_updated_at
    BEFORE UPDATE ON webhook_ip_allowlist
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Nonce validation function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_webhook_nonce(
    p_nonce TEXT,
    p_provider TEXT,
    p_ttl_seconds INTEGER DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Check if nonce was already used
    SELECT EXISTS (
        SELECT 1 FROM webhook_nonces
        WHERE provider = p_provider
          AND nonce = p_nonce
          AND expires_at > now()
    ) INTO v_exists;

    IF v_exists THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'nonce_already_used'
        );
    END IF;

    -- Record the nonce
    INSERT INTO webhook_nonces (nonce, provider, expires_at)
    VALUES (p_nonce, p_provider, now() + make_interval(secs => p_ttl_seconds))
    ON CONFLICT (provider, nonce) DO NOTHING;

    RETURN jsonb_build_object(
        'valid', true,
        'reason', NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_webhook_nonce(TEXT, TEXT, INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.validate_webhook_nonce(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_webhook_nonce(TEXT, TEXT, INTEGER) FROM anon;

-- -----------------------------------------------------------------------------
-- 4. IP allowlist check function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_webhook_ip_allowed(
    p_provider TEXT,
    p_ip_address INET
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM webhook_ip_allowlist
        WHERE provider = p_provider
          AND is_active = true
          AND p_ip_address <<= cidr
    );
$$;

GRANT EXECUTE ON FUNCTION public.check_webhook_ip_allowed(TEXT, INET) TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_webhook_ip_allowed(TEXT, INET) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_webhook_ip_allowed(TEXT, INET) FROM anon;

-- -----------------------------------------------------------------------------
-- 5. Cleanup expired nonces
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_expired_webhook_nonces(
    p_retention_seconds INTEGER DEFAULT 3600
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM webhook_nonces
    WHERE expires_at < now() - make_interval(secs => p_retention_seconds);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_webhook_nonces(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_webhook_nonces(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_webhook_nonces(INTEGER) FROM anon;
