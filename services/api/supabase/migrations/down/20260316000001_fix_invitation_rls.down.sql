-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260316000001_fix_invitation_rls
-- Description: Revert invitation RLS to the original permissive UPDATE policy
-- Issues: #893

-- Drop the two narrow policies
DROP POLICY IF EXISTS household_invitations_update ON household_invitations;
DROP POLICY IF EXISTS household_invitations_accept ON household_invitations;

-- Restore original permissive UPDATE policy
CREATE POLICY household_invitations_update ON household_invitations
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));
