-- Migration: 20260306000003_auth_config
-- Description: Auth configuration, custom claims hook, and passkey credentials table
-- Issues: #68, #69, #70, #71
--
-- This migration:
--   1. Creates the passkey_credentials table for WebAuthn credential storage
--   2. Creates the household_invitations table for invite flow
--   3. Creates a custom access-token hook that embeds household_ids in the JWT
--   4. Documents required Auth provider configuration (Supabase Dashboard)
--
-- Required Supabase Dashboard Configuration (NOT configurable via SQL):
-- =====================================================================
--   Auth → Providers → Email:       Enable email/password sign-in
--   Auth → Providers → Apple:       Enable Apple Sign-In (requires Apple Developer account)
--                                    - Bundle ID, Service ID, Team ID, Key ID, Private Key
--   Auth → Providers → Google:      Enable Google Sign-In
--                                    - Client ID + Client Secret from Google Cloud Console
--   Auth → Hooks → Custom Access Token:
--                                    Point to auth.custom_access_token_hook
--   Auth → URL Configuration:
--                                    - Site URL: https://app.finance.example.com
--                                    - Redirect URLs: com.finance.app://auth/callback,
--                                                     https://app.finance.example.com/auth/callback
-- =====================================================================

-- =============================================================================
-- passkey_credentials — WebAuthn/Passkey credential storage (#69)
-- =============================================================================
-- Stores the public key and metadata for each registered passkey.
-- A user may have multiple passkeys (e.g. Face ID + YubiKey).

CREATE TABLE passkey_credentials (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id),
    credential_id       TEXT        NOT NULL,
    public_key          TEXT        NOT NULL,
    counter             BIGINT      NOT NULL DEFAULT 0,
    device_type         TEXT,
    backed_up           BOOLEAN     NOT NULL DEFAULT false,
    transports          TEXT[],
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_passkey_credentials_credential_id
    ON passkey_credentials (credential_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_passkey_credentials_user
    ON passkey_credentials (user_id)
    WHERE deleted_at IS NULL;

-- RLS: users can only see/manage their own passkeys
ALTER TABLE passkey_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY passkey_credentials_select ON passkey_credentials
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY passkey_credentials_insert ON passkey_credentials
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY passkey_credentials_update ON passkey_credentials
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY passkey_credentials_delete ON passkey_credentials
    FOR DELETE
    USING (user_id = auth.uid());

-- updated_at trigger
CREATE TRIGGER trg_passkey_credentials_updated_at
    BEFORE UPDATE ON passkey_credentials
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- household_invitations — Invite flow for multi-user households (#98)
-- =============================================================================

CREATE TABLE household_invitations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID        NOT NULL REFERENCES households(id),
    invited_by      UUID        NOT NULL REFERENCES users(id),
    invite_code     TEXT        NOT NULL,
    invited_email   TEXT,
    role            TEXT        NOT NULL DEFAULT 'member',
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    accepted_by     UUID        REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_household_invitations_code
    ON household_invitations (invite_code)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_household_invitations_household
    ON household_invitations (household_id)
    WHERE deleted_at IS NULL;

-- RLS: only household members can see invitations for their household
ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY household_invitations_select ON household_invitations
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

-- Only household owner (created_by) can create invitations
CREATE POLICY household_invitations_insert ON household_invitations
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    );

CREATE POLICY household_invitations_update ON household_invitations
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY household_invitations_delete ON household_invitations
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    );

CREATE TRIGGER trg_household_invitations_updated_at
    BEFORE UPDATE ON household_invitations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- webauthn_challenges — Temporary challenge storage for passkey ceremonies
-- =============================================================================

CREATE TABLE webauthn_challenges (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        REFERENCES users(id),
    challenge       TEXT        NOT NULL,
    type            TEXT        NOT NULL CHECK (type IN ('registration', 'authentication')),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webauthn_challenges_user
    ON webauthn_challenges (user_id);
CREATE INDEX idx_webauthn_challenges_expires
    ON webauthn_challenges (expires_at);

-- RLS on challenges — users can only access their own
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY webauthn_challenges_select ON webauthn_challenges
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY webauthn_challenges_insert ON webauthn_challenges
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY webauthn_challenges_delete ON webauthn_challenges
    FOR DELETE
    USING (user_id = auth.uid());

-- =============================================================================
-- audit_log — Immutable audit trail for financial mutations
-- =============================================================================

CREATE TABLE audit_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID        REFERENCES households(id),
    user_id         UUID        NOT NULL,
    action          TEXT        NOT NULL,
    table_name      TEXT        NOT NULL,
    record_id       UUID        NOT NULL,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_household ON audit_log (household_id);
CREATE INDEX idx_audit_log_user ON audit_log (user_id);
CREATE INDEX idx_audit_log_table ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at);

-- RLS: household members can see audit logs for their household
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON audit_log
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()) OR user_id = auth.uid());

-- Insert is service-role only (triggers insert via SECURITY DEFINER functions)
-- No user-facing insert/update/delete policies — the audit log is append-only
-- and written by server-side functions with SECURITY DEFINER.

-- =============================================================================
-- Custom Access Token Hook — Embeds household_ids into JWT claims (#68)
-- =============================================================================
-- Supabase calls this function on every token issue/refresh.
-- The hook adds the user's household_ids as a custom claim so RLS policies
-- can read them from the JWT without a table lookup on every query.
--
-- Configuration: Supabase Dashboard → Auth → Hooks → Custom Access Token
--                → Select: auth.custom_access_token_hook

CREATE OR REPLACE FUNCTION auth.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claims         jsonb;
    user_id        uuid;
    household_ids  uuid[];
BEGIN
    -- Extract the user ID from the event payload
    user_id := (event->>'user_id')::uuid;

    -- Look up all active household memberships for this user
    SELECT COALESCE(array_agg(hm.household_id), '{}'::uuid[])
    INTO household_ids
    FROM household_members hm
    WHERE hm.user_id = user_id
      AND hm.deleted_at IS NULL;

    -- Build the custom claims object
    claims := event->'claims';

    -- Inject household_ids into the JWT claims
    -- This allows RLS policies and client code to read auth.jwt()->'household_ids'
    claims := jsonb_set(
        claims,
        '{household_ids}',
        to_jsonb(household_ids)
    );

    -- Return the modified event with updated claims
    event := jsonb_set(event, '{claims}', claims);

    RETURN event;
END;
$$;

-- Grant execute to the supabase_auth_admin role so the Auth service can call it
GRANT EXECUTE ON FUNCTION auth.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- Revoke from public for security
REVOKE EXECUTE ON FUNCTION auth.custom_access_token_hook(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth.custom_access_token_hook(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION auth.custom_access_token_hook(jsonb) FROM authenticated;

-- =============================================================================
-- Helper: Create user with default household (used by auth-webhook Edge Function)
-- =============================================================================
-- This SECURITY DEFINER function is called from the auth-webhook Edge Function
-- when a new user signs up. It creates the user row, a default household,
-- and links them as owner — all in a single transaction.

CREATE OR REPLACE FUNCTION public.handle_new_user_signup(
    p_user_id   uuid,
    p_email     text,
    p_name      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    display     text;
    hh_id       uuid;
BEGIN
    -- Derive display name from email if not provided
    display := COALESCE(NULLIF(p_name, ''), split_part(p_email, '@', 1));

    -- Create the user row
    INSERT INTO users (id, email, display_name)
    VALUES (p_user_id, p_email, display)
    ON CONFLICT (id) DO NOTHING;

    -- Create a default personal household
    INSERT INTO households (name, created_by)
    VALUES (display || '''s Household', p_user_id)
    RETURNING id INTO hh_id;

    -- Add user as owner of the household
    INSERT INTO household_members (household_id, user_id, role)
    VALUES (hh_id, p_user_id, 'owner');

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'household_id', hh_id,
        'display_name', display
    );
END;
$$;

-- Edge Functions use the service role, which bypasses RLS
-- but we still restrict execute to authenticated + service_role
GRANT EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) FROM anon;
