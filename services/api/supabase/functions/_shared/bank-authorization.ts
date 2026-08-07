// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

/**
 * Check whether a user can manage a household's bank connections.
 *
 * Membership is the normal authorization path. The `created_by` fallback
 * preserves owner access while a newly-created local household membership is
 * still waiting for PowerSync to upload. It cannot grant access to another
 * user's household because both the household id and authenticated user id must
 * match the server row.
 */
export async function canManageHousehold(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
): Promise<boolean> {
  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('id')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (membership) return true;

  const { data: ownedHousehold, error: householdError } = await supabase
    .from('households')
    .select('id')
    .eq('id', householdId)
    .eq('created_by', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (householdError) throw householdError;
  return ownedHousehold !== null;
}
