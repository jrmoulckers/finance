-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260329000001_gdpr_consent_capture
-- Description: GDPR consent capture table, RLS policies, and helper functions
-- Issues: #1100 (Security Review — CRITICAL: Consent capture missing)
--
-- GDPR Articles 6, 7, 8 require explicit, informed, timestamped consent.
-- This table records each consent event (grant or withdrawal) immutably.
--
-- Design:
--   - Immutable append-only log: no UPDATE/DELETE for end users.
--   - Each row = one consent action (granted or withdrawn).
--   - Current consent state is derived: latest row per (user_id, consent_type).
--   - IP address stored for audit (GDPR Recital 42 requires proof of consent).
--   - policy_version tracks which privacy policy the user consented to.

-- =============================================================================
-- Up
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_consents table
-- -----------------------------------------------------------------------------

CREATE TABLE user_consents (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES auth.users(id),
    consent_type        TEXT        NOT NULL
                        CONSTRAINT  user_consents_type_valid
                            CHECK (consent_type IN (
                                'terms_of_service',
                                'privacy_policy',
                                'data_processing',
                                'marketing_email',
                                'analytics',
                                'third_party_sharing',
                                'biometric_data'
                            )),
    status              TEXT        NOT NULL
                        CONSTRAINT  user_consents_status_valid
                            CHECK (status IN ('granted', 'withdrawn')),
    policy_version      TEXT        NOT NULL,
    ip_address          INET,
    user_agent          TEXT,
    metadata            JSONB       DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_consents IS
    'Immutable GDPR consent log. Each row records a consent grant or withdrawal. '
    'Current consent state = latest row per (user_id, consent_type).';

COMMENT ON COLUMN user_consents.consent_type IS
    'The specific consent category (e.g. privacy_policy, marketing_email).';

COMMENT ON COLUMN user_consents.status IS
    'granted = user gave consent; withdrawn = user revoked consent.';

COMMENT ON COLUMN user_consents.policy_version IS
    'Semantic version of the policy document the user consented to (e.g. "2.1.0").';

COMMENT ON COLUMN user_consents.ip_address IS
    'Client IP at time of consent action (GDPR Recital 42 — proof of consent).';

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------

-- Primary lookup: current consent state per user + type (most recent first)
CREATE INDEX idx_user_consents_user_type
    ON user_consents (user_id, consent_type, created_at DESC);

-- Audit queries: all consents by user
CREATE INDEX idx_user_consents_user
    ON user_consents (user_id, created_at DESC);

-- Admin reporting: consent statistics by type
CREATE INDEX idx_user_consents_type
    ON user_consents (consent_type, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. RLS — users can read their own consents, insert their own
-- -----------------------------------------------------------------------------

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

-- Users can see their own consent history
CREATE POLICY user_consents_select ON user_consents
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can record new consent actions (grants/withdrawals)
CREATE POLICY user_consents_insert ON user_consents
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- NO UPDATE policy: consent records are immutable
-- NO DELETE policy: consent records cannot be removed (GDPR audit requirement)

-- Service role can read all consents (for admin/compliance dashboard)
-- (service_role bypasses RLS by default)

-- -----------------------------------------------------------------------------
-- 4. Helper function: get current consent status for a user
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_consent_status(
    p_user_id UUID,
    p_consent_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    consent_type TEXT,
    status TEXT,
    policy_version TEXT,
    consented_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT ON (uc.consent_type)
        uc.consent_type,
        uc.status,
        uc.policy_version,
        uc.created_at AS consented_at
    FROM user_consents uc
    WHERE uc.user_id = p_user_id
      AND (p_consent_type IS NULL OR uc.consent_type = p_consent_type)
    ORDER BY uc.consent_type, uc.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_user_consent_status(UUID, TEXT) IS
    'Returns the current (latest) consent status per type for a given user. '
    'Pass NULL for p_consent_type to get all consent types.';

GRANT EXECUTE ON FUNCTION public.get_user_consent_status(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_consent_status(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_consent_status(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_consent_status(UUID, TEXT) FROM anon;

-- -----------------------------------------------------------------------------
-- 5. Helper function: check if user has active consent for a specific type
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_active_consent(
    p_user_id UUID,
    p_consent_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT uc.status = 'granted'
            FROM user_consents uc
            WHERE uc.user_id = p_user_id
              AND uc.consent_type = p_consent_type
            ORDER BY uc.created_at DESC
            LIMIT 1
        ),
        false
    );
$$;

COMMENT ON FUNCTION public.has_active_consent(UUID, TEXT) IS
    'Returns true if the user''s most recent consent action for the given type is "granted".';

GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) FROM anon;
