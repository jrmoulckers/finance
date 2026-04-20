-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260316000001_edge_function_security
-- Description: Revert idempotent signup and drop accept_household_invitation RPC
-- Issues: #893
--
-- Restores the original (non-idempotent) handle_new_user_signup and drops
-- the accept_household_invitation function.

-- =============================================================================
-- 1. Drop accept_household_invitation RPC
-- =============================================================================
DROP FUNCTION IF EXISTS public.accept_household_invitation(text, uuid, text);

-- =============================================================================
-- 2. Restore original (non-idempotent) handle_new_user_signup
-- =============================================================================
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
    display := COALESCE(NULLIF(p_name, ''), split_part(p_email, '@', 1));

    INSERT INTO users (id, email, display_name)
    VALUES (p_user_id, p_email, display)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO households (name, created_by)
    VALUES (display || '''s Household', p_user_id)
    RETURNING id INTO hh_id;

    INSERT INTO household_members (household_id, user_id, role)
    VALUES (hh_id, p_user_id, 'owner');

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'household_id', hh_id,
        'display_name', display
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup(uuid, text, text) FROM anon;
