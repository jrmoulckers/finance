-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260316000001_fix_invitation_rls
-- Description: Restrict household_invitations UPDATE to owner + invited-user accept
-- Security Finding: H-2 (High) — API Security Audit v2
-- Issues: #375
--
-- Problem: The existing UPDATE policy on household_invitations allows ANY
-- household member to modify invitations (change role, cancel, etc.), enabling
-- role escalation and unauthorized invitation management.
--
-- Fix: Replace the single permissive UPDATE policy with two narrow policies:
--   1. Owner-only management: only the household creator can update invitations
--      (cancel, change role, revoke, etc.)
--   2. Invited-user acceptance: the invited user can accept a pending, non-expired
--      invitation by setting accepted_at / accepted_by.
--
-- DOWN migration (commented at bottom): drops the two new policies and restores
-- the original permissive policy.

-- =============================================================================
-- UP
-- =============================================================================

-- Drop the overly permissive UPDATE policy that allows any household member
DROP POLICY IF EXISTS household_invitations_update ON household_invitations;

-- 1. Owner-only management: household creator can update any invitation field
--    Consistent with household_invitations_insert / _delete which already use
--    the same EXISTS pattern against households.created_by.
CREATE POLICY household_invitations_update ON household_invitations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_invitations.household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_invitations.household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    );

-- 2. Invited-user acceptance: the person who was invited can accept
--    - USING: only rows matching their email, still pending, not expired/deleted
--    - WITH CHECK: they can only set accepted_by to themselves and must set accepted_at
--    Uses auth.jwt()->>'email' to avoid requiring SELECT on auth.users.
CREATE POLICY household_invitations_accept ON household_invitations
    FOR UPDATE
    USING (
        invited_email = (auth.jwt() ->> 'email')
        AND accepted_at IS NULL
        AND deleted_at IS NULL
        AND expires_at > now()
    )
    WITH CHECK (
        accepted_by = auth.uid()
        AND accepted_at IS NOT NULL
    );

-- =============================================================================
-- DOWN (to revert this migration, run the following statements)
-- =============================================================================
-- DROP POLICY IF EXISTS household_invitations_update ON household_invitations;
-- DROP POLICY IF EXISTS household_invitations_accept ON household_invitations;
--
-- CREATE POLICY household_invitations_update ON household_invitations
--     FOR UPDATE
--     USING (household_id = ANY(auth.household_ids()))
--     WITH CHECK (household_id = ANY(auth.household_ids()));
