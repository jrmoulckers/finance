-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260306000003_auth_config
-- Description: Drop auth config, passkey credentials, invitations, challenges, audit log
-- Issues: #893
--
-- Drops in reverse creation order. The custom access token hook and signup
-- handler are also removed.

-- =============================================================================
-- Drop functions
-- =============================================================================
DROP FUNCTION IF EXISTS public.handle_new_user_signup(uuid, text, text);
DROP FUNCTION IF EXISTS auth.custom_access_token_hook(jsonb);

-- =============================================================================
-- Drop audit_log
-- =============================================================================
DROP POLICY IF EXISTS audit_log_select ON audit_log;
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS audit_log;

-- =============================================================================
-- Drop webauthn_challenges
-- =============================================================================
DROP POLICY IF EXISTS webauthn_challenges_delete ON webauthn_challenges;
DROP POLICY IF EXISTS webauthn_challenges_insert ON webauthn_challenges;
DROP POLICY IF EXISTS webauthn_challenges_select ON webauthn_challenges;
ALTER TABLE webauthn_challenges DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS webauthn_challenges;

-- =============================================================================
-- Drop household_invitations
-- =============================================================================
DROP TRIGGER IF EXISTS trg_household_invitations_updated_at ON household_invitations;
DROP POLICY IF EXISTS household_invitations_delete ON household_invitations;
DROP POLICY IF EXISTS household_invitations_update ON household_invitations;
DROP POLICY IF EXISTS household_invitations_insert ON household_invitations;
DROP POLICY IF EXISTS household_invitations_select ON household_invitations;
ALTER TABLE household_invitations DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS household_invitations;

-- =============================================================================
-- Drop passkey_credentials
-- =============================================================================
DROP TRIGGER IF EXISTS trg_passkey_credentials_updated_at ON passkey_credentials;
DROP POLICY IF EXISTS passkey_credentials_delete ON passkey_credentials;
DROP POLICY IF EXISTS passkey_credentials_update ON passkey_credentials;
DROP POLICY IF EXISTS passkey_credentials_insert ON passkey_credentials;
DROP POLICY IF EXISTS passkey_credentials_select ON passkey_credentials;
ALTER TABLE passkey_credentials DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS passkey_credentials;
