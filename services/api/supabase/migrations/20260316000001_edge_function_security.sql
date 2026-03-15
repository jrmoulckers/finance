-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260316000001_edge_function_security
-- Description: Security hardening for Edge Function database operations
-- Issues: #375
--
-- Changes:
--   1. Make handle_new_user_signup idempotent (M-6): guard against duplicate
--      webhook fires creating duplicate households.
--   2. Add accept_household_invitation atomic RPC (API-8): wrap invitation
--      acceptance in a single transaction with row-level locking to prevent
--      race conditions (duplicate memberships, double-acceptance).

-- =============================================================================
-- 1. Idempotent handle_new_user_signup (M-6)
-- =============================================================================
-- If the auth webhook fires twice for the same signup event, the second call
-- must be a no-op. The original function had ON CONFLICT DO NOTHING for the
-- user INSERT but unconditionally created a new household + membership on
-- every invocation. This version checks for an existing membership first.

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

    -- Upsert the user row (idempotent)
    INSERT INTO users (id, email, display_name)
    VALUES (p_user_id, p_email, display)
    ON CONFLICT (id) DO NOTHING;

    -- =========================================================================
    -- Idempotency guard (M-6): If the user already has an active household
    -- membership, this is a duplicate webhook fire — return existing data
    -- without creating a second household.
    -- =========================================================================
    SELECT hm.household_id INTO hh_id
    FROM household_members hm
    WHERE hm.user_id = p_user_id
      AND hm.deleted_at IS NULL
    ORDER BY hm.created_at ASC
    LIMIT 1;

    IF hh_id IS NOT NULL THEN
        -- Re-read the display name in case it was set on the first run
        SELECT u.display_name INTO display
        FROM users u
        WHERE u.id = p_user_id;

        RETURN jsonb_build_object(
            'user_id',              p_user_id,
            'household_id',         hh_id,
            'display_name',         COALESCE(display, split_part(p_email, '@', 1)),
            'already_provisioned',  true
        );
    END IF;

    -- Create a default personal household
    INSERT INTO households (name, created_by)
    VALUES (display || '''s Household', p_user_id)
    RETURNING id INTO hh_id;

    -- Add user as owner of the household
    INSERT INTO household_members (household_id, user_id, role)
    VALUES (hh_id, p_user_id, 'owner');

    RETURN jsonb_build_object(
        'user_id',        p_user_id,
        'household_id',   hh_id,
        'display_name',   display
    );
END;
$$;

-- Permissions unchanged from the original migration — service_role only
GRANT EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) FROM anon;

-- =============================================================================
-- 2. Atomic accept_household_invitation RPC (API-8)
-- =============================================================================
-- Replaces the multi-step check → insert → update sequence in the Edge
-- Function with a single atomic transaction.  SELECT ... FOR UPDATE on the
-- invitation row serialises concurrent acceptance attempts, preventing:
--   • Two different users accepting a single-use invite simultaneously
--   • The same user accepting twice (race past the membership check)
--
-- Error signalling: application-level errors are returned as
-- jsonb { "error": "<CODE>" } so the Edge Function can map them to the
-- appropriate HTTP status without parsing PostgreSQL exception messages.

CREATE OR REPLACE FUNCTION public.accept_household_invitation(
    p_invite_code   text,
    p_user_id       uuid,
    p_user_email    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation    RECORD;
    v_household_name text;
BEGIN
    -- Lock the invitation row to serialise concurrent acceptance attempts.
    -- Any competing transaction blocks here until this one commits.
    SELECT *
    INTO v_invitation
    FROM household_invitations
    WHERE invite_code = p_invite_code
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'INVITE_NOT_FOUND');
    END IF;

    -- Already accepted?
    IF v_invitation.accepted_at IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'INVITE_ALREADY_ACCEPTED');
    END IF;

    -- Expired?
    IF v_invitation.expires_at < now() THEN
        RETURN jsonb_build_object('error', 'INVITE_EXPIRED');
    END IF;

    -- Email-restricted invite sent to a different address?
    IF v_invitation.invited_email IS NOT NULL
       AND v_invitation.invited_email <> p_user_email THEN
        RETURN jsonb_build_object('error', 'INVITE_EMAIL_MISMATCH');
    END IF;

    -- Already a member of this household?
    IF EXISTS (
        SELECT 1 FROM household_members
        WHERE household_id = v_invitation.household_id
          AND user_id = p_user_id
          AND deleted_at IS NULL
    ) THEN
        RETURN jsonb_build_object('error', 'ALREADY_MEMBER');
    END IF;

    -- =========================================================================
    -- Atomic mutation: insert membership + mark invitation accepted
    -- =========================================================================
    INSERT INTO household_members (household_id, user_id, role)
    VALUES (v_invitation.household_id, p_user_id, v_invitation.role);

    UPDATE household_invitations
    SET accepted_at = now(),
        accepted_by = p_user_id
    WHERE id = v_invitation.id;

    -- Fetch household name for the response
    SELECT name INTO v_household_name
    FROM households
    WHERE id = v_invitation.household_id;

    RETURN jsonb_build_object(
        'household_id',   v_invitation.household_id,
        'household_name', COALESCE(v_household_name, 'Unknown'),
        'role',           v_invitation.role
    );
END;
$$;

-- Edge Functions call this via service role
GRANT EXECUTE ON FUNCTION public.accept_household_invitation(text, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.accept_household_invitation(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_household_invitation(text, uuid, text) FROM anon;
