-- SPDX-License-Identifier: BUSL-1.1
-- Migration: 20260329000004_webhook_security_hardening (#1104)
-- Up
CREATE TABLE webhook_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nonce TEXT NOT NULL, provider TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_webhook_nonces_provider_nonce UNIQUE (provider, nonce)
);
CREATE INDEX idx_webhook_nonces_expires ON webhook_nonces (expires_at);
ALTER TABLE webhook_nonces ENABLE ROW LEVEL SECURITY;

CREATE TABLE webhook_ip_allowlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider TEXT NOT NULL, cidr CIDR NOT NULL,
    description TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_webhook_ip_provider_cidr UNIQUE (provider, cidr)
);
CREATE INDEX idx_webhook_ip_allowlist_provider ON webhook_ip_allowlist (provider) WHERE is_active = true;
ALTER TABLE webhook_ip_allowlist ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_webhook_ip_allowlist_updated_at BEFORE UPDATE ON webhook_ip_allowlist FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO webhook_ip_allowlist (provider, cidr, description) VALUES
    ('stripe','3.18.12.63/32','Stripe US'),('stripe','3.130.192.231/32','Stripe US'),
    ('stripe','13.235.14.237/32','Stripe IN'),('stripe','13.235.122.149/32','Stripe IN'),
    ('stripe','18.211.135.69/32','Stripe US'),('stripe','35.154.171.200/32','Stripe IN'),
    ('stripe','52.15.183.38/32','Stripe US'),('stripe','54.88.130.119/32','Stripe US'),
    ('stripe','54.88.130.237/32','Stripe US'),('stripe','54.187.174.169/32','Stripe US'),
    ('stripe','54.187.205.235/32','Stripe US'),('stripe','54.187.216.72/32','Stripe US'),
    ('plaid','52.21.26.131/32','Plaid US'),('plaid','52.21.47.157/32','Plaid US'),
    ('plaid','52.41.247.19/32','Plaid US'),('plaid','52.88.82.239/32','Plaid US');

CREATE OR REPLACE FUNCTION public.validate_webhook_nonce(p_nonce TEXT, p_provider TEXT, p_ttl_seconds INTEGER DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM webhook_nonces WHERE provider = p_provider AND nonce = p_nonce AND expires_at > now()) INTO v_exists;
    IF v_exists THEN RETURN jsonb_build_object('valid', false, 'reason', 'nonce_already_used'); END IF;
    INSERT INTO webhook_nonces (nonce, provider, expires_at) VALUES (p_nonce, p_provider, now() + make_interval(secs => p_ttl_seconds)) ON CONFLICT (provider, nonce) DO NOTHING;
    RETURN jsonb_build_object('valid', true, 'reason', NULL);
END; $$;
GRANT EXECUTE ON FUNCTION public.validate_webhook_nonce(TEXT, TEXT, INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.validate_webhook_nonce(TEXT, TEXT, INTEGER) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.check_webhook_ip_allowed(p_provider TEXT, p_ip_address INET)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM webhook_ip_allowlist WHERE provider = p_provider AND is_active = true AND p_ip_address <<= cidr);
$$;
GRANT EXECUTE ON FUNCTION public.check_webhook_ip_allowed(TEXT, INET) TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_webhook_ip_allowed(TEXT, INET) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cleanup_expired_webhook_nonces(p_retention_seconds INTEGER DEFAULT 3600)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted INTEGER;
BEGIN DELETE FROM webhook_nonces WHERE expires_at < now() - make_interval(secs => p_retention_seconds); GET DIAGNOSTICS v_deleted = ROW_COUNT; RETURN v_deleted; END; $$;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_webhook_nonces(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_webhook_nonces(INTEGER) FROM PUBLIC;
