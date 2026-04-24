-- SPDX-License-Identifier: BUSL-1.1
-- Migration: 20260329000001_gdpr_consent_capture (#1100 CRITICAL)
-- Up
CREATE TABLE user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    consent_type TEXT NOT NULL CHECK (consent_type IN ('terms_of_service','privacy_policy','data_processing','marketing_email','analytics','third_party_sharing','biometric_data')),
    status TEXT NOT NULL CHECK (status IN ('granted', 'withdrawn')),
    policy_version TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_consents_user_type ON user_consents (user_id, consent_type, created_at DESC);
CREATE INDEX idx_user_consents_user ON user_consents (user_id, created_at DESC);
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_consents_select ON user_consents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_consents_insert ON user_consents FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_user_consent_status(p_user_id UUID, p_consent_type TEXT DEFAULT NULL)
RETURNS TABLE (consent_type TEXT, status TEXT, policy_version TEXT, consented_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT ON (uc.consent_type) uc.consent_type, uc.status, uc.policy_version, uc.created_at
    FROM user_consents uc WHERE uc.user_id = p_user_id AND (p_consent_type IS NULL OR uc.consent_type = p_consent_type)
    ORDER BY uc.consent_type, uc.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_consent_status(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_consent_status(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_consent_status(UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.has_active_consent(p_user_id UUID, p_consent_type TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT uc.status = 'granted' FROM user_consents uc WHERE uc.user_id = p_user_id AND uc.consent_type = p_consent_type ORDER BY uc.created_at DESC LIMIT 1), false);
$$;
GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) FROM PUBLIC;
