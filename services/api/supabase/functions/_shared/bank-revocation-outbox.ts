// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export type RetentionSelectionStatus =
  'saved' | 'forbidden' | 'not_scheduled' | 'invalid_selection';

export interface RetentionSelectionResult {
  status: RetentionSelectionStatus;
  effectiveAt: string | null;
  selectedCount: number;
}

export interface ClaimedBankRevocationJob {
  id: string;
  provider: string;
  encryptedAccessToken: string;
  leaseToken: string;
}

interface SelectionRow {
  status: RetentionSelectionStatus;
  effective_at: string | null;
  selected_count: number | string | null;
}

interface RevocationRequestRow {
  status: 'queued' | 'forbidden' | 'not_found';
}

interface ClaimedRow {
  id: string | null;
  provider: string | null;
  encrypted_access_token: string | null;
  lease_token: string | null;
}

function firstRow<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) return data[0] as T | undefined;
  return (data ?? undefined) as T | undefined;
}

export async function saveRetentionSelection(
  supabase: SupabaseClient,
  params: { householdId: string; actorUserId: string; retainedConnectionIds: readonly string[] },
): Promise<RetentionSelectionResult> {
  const { data, error } = await supabase.rpc('save_bank_connection_retention_selection', {
    p_household_id: params.householdId,
    p_actor_user_id: params.actorUserId,
    p_retained_connection_ids: params.retainedConnectionIds,
  });
  if (error) throw new Error('retention selection could not be saved');

  const row = firstRow<SelectionRow>(data);
  if (!row) throw new Error('retention selection response was empty');
  return {
    status: row.status,
    effectiveAt: row.effective_at,
    selectedCount: Number(row.selected_count ?? 0),
  };
}

export async function queueConnectionRevocation(
  supabase: SupabaseClient,
  params: { connectionId: string; actorUserId: string },
): Promise<'queued' | 'forbidden' | 'not_found'> {
  const { data, error } = await supabase.rpc('request_bank_connection_revocation', {
    p_connection_id: params.connectionId,
    p_actor_user_id: params.actorUserId,
  });
  if (error) throw new Error('bank revocation could not be queued');

  const row = firstRow<RevocationRequestRow>(data);
  if (!row) throw new Error('bank revocation response was empty');
  return row.status;
}

export async function queueProviderPermissionRevocation(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('enqueue_bank_connection_revocation_internal', {
    p_connection_id: connectionId,
    p_reason: 'user_disconnect',
    p_detach_identity: false,
  });
  if (error) throw new Error('provider revocation could not be durably queued');
}

export async function severBankRevocationIdentitiesForAccount(
  supabase: SupabaseClient,
  params: { ownerId: string; householdIds: readonly string[] },
): Promise<number> {
  const { data, error } = await supabase.rpc('sever_bank_revocation_identities_for_account', {
    p_owner_id: params.ownerId,
    p_household_ids: params.householdIds.length > 0 ? params.householdIds : null,
  });
  if (error) throw new Error('provider erasure could not be durably queued');
  return Number(data ?? 0);
}

export async function enforceDueBankConnectionDowngrades(
  supabase: SupabaseClient,
  limit: number,
): Promise<void> {
  const { error } = await supabase.rpc('enforce_due_bank_connection_downgrades', {
    p_limit: limit,
  });
  if (error) throw new Error('due bank downgrades could not be enforced');
}

export async function claimBankRevocationJobs(
  supabase: SupabaseClient,
  params: { limit: number; leaseSeconds: number },
): Promise<ClaimedBankRevocationJob[]> {
  const { data, error } = await supabase.rpc('claim_bank_revocation_jobs', {
    p_limit: params.limit,
    p_lease_seconds: params.leaseSeconds,
  });
  if (error) throw new Error('bank revocation jobs could not be claimed');
  if (!Array.isArray(data)) throw new Error('bank revocation claim response was invalid');

  return (data as ClaimedRow[]).map((row) => {
    if (!row.id || !row.provider || !row.encrypted_access_token || !row.lease_token) {
      throw new Error('bank revocation claim contained an incomplete job');
    }
    return {
      id: row.id,
      provider: row.provider,
      encryptedAccessToken: row.encrypted_access_token,
      leaseToken: row.lease_token,
    };
  });
}

export async function recordBankRevocationResult(
  supabase: SupabaseClient,
  params: {
    id: string;
    leaseToken: string;
    succeeded: boolean;
    errorCode: string | null;
  },
): Promise<'revoked' | 'retry_wait' | 'exhausted' | 'stale'> {
  const { data, error } = await supabase.rpc('record_bank_revocation_result', {
    p_id: params.id,
    p_lease_token: params.leaseToken,
    p_succeeded: params.succeeded,
    p_error_code: params.errorCode,
  });
  if (error) throw new Error('bank revocation result could not be recorded');
  if (!['revoked', 'retry_wait', 'exhausted', 'stale'].includes(String(data))) {
    throw new Error('bank revocation result response was invalid');
  }
  return String(data) as 'revoked' | 'retry_wait' | 'exhausted' | 'stale';
}
