// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export type DowngradeSelectionStatus =
  | 'selected'
  | 'forbidden'
  | 'invalid_transition'
  | 'invalid_selection'
  | 'entitlement_unavailable'
  | 'error';

export interface ClaimedBankRevocation {
  id: string;
  provider: string;
  encryptedAccessToken: string;
  status: 'pending_revocation' | 'pending_reconciliation';
  connectionId: string | null;
  sourceReason: 'finalization' | 'disconnect' | 'downgrade' | 'account_deletion';
  attempts: number;
}

interface SelectionRow {
  status: string;
  selected_count: number | string | null;
  target_allowance: number | string | null;
}

interface EnqueueRow {
  status: string;
  outbox_id: string | null;
}

interface ClaimRow {
  id: string | null;
  provider: string | null;
  encrypted_access_token: string | null;
  status: string | null;
  connection_id: string | null;
  source_reason: string | null;
  attempts: number | string | null;
}

function firstRow<T>(data: unknown): T | undefined {
  return Array.isArray(data) ? (data[0] as T | undefined) : ((data ?? undefined) as T | undefined);
}

function numberValue(value: number | string | null): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export async function selectBankConnectionsForDowngrade(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    actorId: string;
    targetTier: 'free' | 'plus' | 'premium';
    selectedConnectionIds: readonly string[];
  },
): Promise<{
  status: DowngradeSelectionStatus;
  selectedCount: number;
  targetAllowance: number;
}> {
  const { data, error } = await supabase.rpc('select_bank_connections_for_downgrade', {
    p_household_id: params.householdId,
    p_actor_id: params.actorId,
    p_target_tier: params.targetTier,
    p_selected_connection_ids: [...params.selectedConnectionIds],
  });
  if (error) return { status: 'error', selectedCount: 0, targetAllowance: 0 };
  const row = firstRow<SelectionRow>(data);
  if (!row) return { status: 'error', selectedCount: 0, targetAllowance: 0 };
  const allowed = new Set<DowngradeSelectionStatus>([
    'selected',
    'forbidden',
    'invalid_transition',
    'invalid_selection',
    'entitlement_unavailable',
  ]);
  return {
    status: allowed.has(row.status as DowngradeSelectionStatus)
      ? (row.status as DowngradeSelectionStatus)
      : 'error',
    selectedCount: numberValue(row.selected_count),
    targetAllowance: numberValue(row.target_allowance),
  };
}

export async function enqueueBankConnectionRevocation(
  supabase: SupabaseClient,
  params: { connectionId: string; actorId: string; reason?: 'disconnect' | 'account_deletion' },
): Promise<'enqueued' | 'not_found' | 'forbidden' | 'error'> {
  const { data, error } = await supabase.rpc('enqueue_bank_connection_revocation', {
    p_connection_id: params.connectionId,
    p_actor_id: params.actorId,
    p_reason: params.reason ?? 'disconnect',
  });
  if (error) return 'error';
  const status = firstRow<EnqueueRow>(data)?.status;
  return status === 'enqueued' || status === 'not_found' || status === 'forbidden'
    ? status
    : 'error';
}

export async function enqueueBankRevocationsForErasure(
  supabase: SupabaseClient,
  params: { ownerId: string; householdIds: readonly string[] },
): Promise<number> {
  const { data, error } = await supabase.rpc('enqueue_bank_revocations_for_erasure', {
    p_owner_id: params.ownerId,
    p_household_ids: [...params.householdIds],
  });
  if (error) throw new Error('Could not persist provider erasure work');
  return numberValue(Array.isArray(data) ? (data[0] as number | string | null) : data);
}

export async function reconcileBankConnectionAllowances(
  supabase: SupabaseClient,
  limit = 100,
): Promise<number> {
  const { data, error } = await supabase.rpc('reconcile_all_bank_connection_allowances', {
    p_limit: limit,
  });
  if (error) throw new Error('Could not reconcile bank connection allowances');
  return numberValue(Array.isArray(data) ? (data[0] as number | string | null) : data);
}

export async function claimBankRevocationJobs(
  supabase: SupabaseClient,
  params: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<ClaimedBankRevocation[]> {
  const { data, error } = await supabase.rpc('claim_bank_revocation_jobs', {
    p_worker_id: params.workerId,
    p_limit: params.limit ?? 25,
    p_lease_seconds: params.leaseSeconds ?? 120,
  });
  if (error || !Array.isArray(data)) throw new Error('Could not claim revocation jobs');

  return (data as ClaimRow[]).map((row) => {
    if (
      !row.id ||
      !row.provider ||
      !row.encrypted_access_token ||
      (row.status !== 'pending_revocation' && row.status !== 'pending_reconciliation') ||
      !row.source_reason
    ) {
      throw new Error('Malformed revocation job');
    }
    return {
      id: row.id,
      provider: row.provider,
      encryptedAccessToken: row.encrypted_access_token,
      status: row.status,
      connectionId: row.connection_id,
      sourceReason: row.source_reason as ClaimedBankRevocation['sourceReason'],
      attempts: numberValue(row.attempts),
    };
  });
}

export async function resolveBankRevocationReconciliation(
  supabase: SupabaseClient,
  params: { id: string; workerId: string },
): Promise<'revoke' | 'retained' | 'stale_claim'> {
  const { data, error } = await supabase.rpc('resolve_bank_revocation_reconciliation', {
    p_id: params.id,
    p_worker_id: params.workerId,
  });
  if (error) throw new Error('Could not reconcile revocation job');
  const value = Array.isArray(data) ? data[0] : data;
  if (value === 'revoke' || value === 'retained' || value === 'stale_claim') return value;
  throw new Error('Malformed reconciliation result');
}

export async function completeBankRevocationJob(
  supabase: SupabaseClient,
  params: { id: string; workerId: string; alreadyInvalid: boolean },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_bank_revocation_job', {
    p_id: params.id,
    p_worker_id: params.workerId,
    p_already_invalid: params.alreadyInvalid,
  });
  if (error) throw new Error('Could not complete revocation job');
  return (Array.isArray(data) ? data[0] : data) === true;
}

export async function failBankRevocationJob(
  supabase: SupabaseClient,
  params: { id: string; workerId: string; errorCode: string },
): Promise<'pending_revocation' | 'pending_reconciliation' | 'exhausted' | 'stale_claim'> {
  const { data, error } = await supabase.rpc('fail_bank_revocation_job', {
    p_id: params.id,
    p_worker_id: params.workerId,
    p_error_code: normalizeRevocationErrorCode(params.errorCode),
  });
  if (error) throw new Error('Could not record revocation failure');
  const status = firstRow<{ status: string }>(data)?.status;
  if (
    status === 'pending_revocation' ||
    status === 'pending_reconciliation' ||
    status === 'exhausted' ||
    status === 'stale_claim'
  ) {
    return status;
  }
  throw new Error('Malformed revocation failure result');
}

export function normalizeRevocationErrorCode(detail: string | null | undefined): string {
  const normalized = (detail ?? 'REVOCATION_FAILED')
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 128);
  return normalized || 'REVOCATION_FAILED';
}
