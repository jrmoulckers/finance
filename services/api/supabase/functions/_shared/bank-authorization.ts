// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

/**
 * Ensure a user can manage a household's bank connections.
 *
 * Membership is the normal authorization path. The `created_by` fallback
 * preserves owner access while PowerSync is still uploading the membership.
 * Link-token creation may also provision a missing server household that
 * already exists in the authenticated user's local database. The membership is
 * deliberately left to PowerSync because its local row has a client-generated
 * id; synthesizing a second server row would violate the unique active-member
 * constraint when the queued row uploads.
 */
export async function ensureCanManageHousehold(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  options: { provisionIfMissing?: boolean } = {},
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

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, created_by')
    .eq('id', householdId)
    .is('deleted_at', null)
    .maybeSingle();

  if (householdError) throw householdError;
  if (household && household.created_by !== userId) return false;

  if (household) return true;
  if (!options.provisionIfMissing) return false;

  const { error: createError } = await supabase
    .from('households')
    .upsert(
      { id: householdId, name: 'My Household', created_by: userId },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  if (createError) throw createError;

  // Re-read after the conflict-safe insert. If PowerSync or another request won
  // the race, authorize only when that existing row belongs to this user.
  const { data: provisionedHousehold, error: provisionError } = await supabase
    .from('households')
    .select('id, created_by')
    .eq('id', householdId)
    .is('deleted_at', null)
    .maybeSingle();

  if (provisionError) throw provisionError;
  return provisionedHousehold?.created_by === userId;
}
