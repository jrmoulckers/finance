// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

/**
 * Ensure a user can manage a household's bank connections.
 *
 * Membership is the normal authorization path. The `created_by` fallback
 * preserves owner access while PowerSync is still uploading the membership.
 * Link-token creation may also provision a missing server household that
 * already exists in the authenticated user's local database. It ensures the
 * creator has a server membership so PowerSync can publish the household
 * bucket immediately; the upload connector reconciles the queued local
 * membership when its client-generated id differs.
 */
async function ensureOwnerMembership(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
): Promise<void> {
  const readActiveMembership = () =>
    supabase
      .from('household_members')
      .select('id, role')
      .eq('household_id', householdId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
  const promoteMembership = async (membership: { id: string; role: string }): Promise<void> => {
    if (membership.role === 'owner' || membership.role === 'admin') return;
    const { error } = await supabase.from('household_members').upsert(
      {
        id: membership.id,
        household_id: householdId,
        user_id: userId,
        role: 'owner',
      },
      { onConflict: 'id', ignoreDuplicates: false },
    );
    if (error) throw error;
  };

  const { data: activeMembership, error: activeMembershipError } = await readActiveMembership();
  if (activeMembershipError) throw activeMembershipError;
  if (activeMembership) {
    await promoteMembership(activeMembership);
    return;
  }

  const { error: createMembershipError } = await supabase.from('household_members').insert({
    household_id: householdId,
    user_id: userId,
    role: 'owner',
  });
  if (!createMembershipError) return;

  // Concurrent provisioning can hit the partial unique active-membership index.
  // Re-read the exact owner row before accepting that conflict as success.
  if (createMembershipError.code !== '23505') throw createMembershipError;
  const { data: existingMembership, error: membershipError } = await readActiveMembership();
  if (membershipError) throw membershipError;
  if (!existingMembership) throw createMembershipError;
  await promoteMembership(existingMembership);
}

export async function ensureCanManageHousehold(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  options: { provisionIfMissing?: boolean; userEmail?: string } = {},
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

  if (household) {
    if (options.provisionIfMissing) {
      await ensureOwnerMembership(supabase, householdId, userId);
    }
    return true;
  }
  if (!options.provisionIfMissing) return false;

  const { data: applicationUser, error: applicationUserError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (applicationUserError) throw applicationUserError;

  if (!applicationUser) {
    const email = options.userEmail?.trim();
    if (!email) {
      throw new Error('Authenticated user email is required to provision an application profile');
    }

    const displayName = email.split('@')[0]?.trim() || 'User';
    const { error: createUserError } = await supabase
      .from('users')
      .upsert(
        { id: userId, email, display_name: displayName },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    if (createUserError) throw createUserError;

    const { data: provisionedUser, error: provisionUserError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (provisionUserError) throw provisionUserError;
    if (!provisionedUser) {
      throw new Error('Application user profile provisioning did not create a readable row');
    }
  }

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
  if (provisionedHousehold?.created_by !== userId) return false;

  await ensureOwnerMembership(supabase, householdId, userId);
  return true;
}
