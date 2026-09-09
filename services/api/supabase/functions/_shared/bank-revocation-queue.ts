// SPDX-License-Identifier: BUSL-1.1

/**
 * Typed RPC boundary for the server-only bank revocation outbox (#4405).
 *
 * Credential-bearing rows are returned only to the service-role worker. Client
 * handlers receive status/count results and never receive provider identifiers
 * or encrypted credentials.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export type RetentionSelectionStatus =
  'accepted' | 'forbidden' | 'invalid_target' | 'invalid_selection' | 'error';

export type RevocationEnqueueStatus = 'enqueued' | 'forbidden' | 'not_found' | 'error';

export interface ClaimedBankRevocationJob {
  id: string;
  provider: string;
  encryptedAccessToken: string | null;
  connectionId: string | null;
  operationReason: string;
  reconciliationRequired: boolean;
  claimToken: string;
  attemptNumber: number;
}

interface EnqueueRow {
  result_status: string | null;
  outbox_id: string | null;
}

interface ClaimedRow {
  id: string | null;
  provider: string | null;
  encrypted_access_token: string | null;
  connection_id: string | null;
  operation_reason: string | null;
  reconciliation_required: boolean | null;
  claim_token: string | null;
  attempt_number: number | string | null;
}

function firstRow<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) return data[0] as T | undefined;
  return (data ?? undefined) as T | undefined;
}

export async function saveBankRetentionSelection(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    actorId: string;
    targetAllowance: number;
    retainedConnectionIds: readonly string[];
  },
): Promise<RetentionSelectionStatus> {
  const { data, error } = await supabase.rpc('prepare_bank_connection_retention_selection', {
    p_household_id: params.householdId,
    p_actor_id: params.actorId,
    p_target_allowance: params.targetAllowance,
    p_retained_connection_ids: params.retainedConnectionIds,
  });
  if (error) return 'error';

  const status = typeof data === 'string' ? data : firstRow<string>(data);
  switch (status) {
    case 'accepted':
    case 'forbidden':
    case 'invalid_target':
    case 'invalid_selection':
      return status;
    default:
      return 'error';
  }
}

export async function enqueueBankConnectionRevocation(
  supabase: SupabaseClient,
  params: { connectionId: string; reason: 'user_disconnect'; actorId: string },
): Promise<RevocationEnqueueStatus> {
  const { data, error } = await supabase.rpc('enqueue_bank_connection_revocation', {
    p_connection_id: params.connectionId,
    p_reason: params.reason,
    p_actor_id: params.actorId,
    p_erasure_requested: false,
  });
  if (error) return 'error';

  const row = firstRow<EnqueueRow>(data);
  switch (row?.result_status) {
    case 'enqueued':
    case 'forbidden':
    case 'not_found':
      return row.result_status;
    default:
      return 'error';
  }
}

/**
 * Account deletion cannot discard a credential unless durable enqueue commits.
 * Database/provider outages are distinct: provider availability never blocks
 * deletion, while a failed database handoff fails the request before erasure.
 */
export async function enqueueAccountBankRevocations(
  supabase: SupabaseClient,
  params: { ownerId: string; householdIds: readonly string[] },
): Promise<number> {
  const { data, error } = await supabase.rpc('enqueue_bank_connection_erasure', {
    p_owner_id: params.ownerId,
    p_household_ids: params.householdIds.length > 0 ? params.householdIds : null,
  });
  if (error) throw new Error('bank revocation handoff failed');

  const value = typeof data === 'number' || typeof data === 'string' ? Number(data) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('bank revocation handoff returned an invalid count');
  }
  return value;
}

export async function claimBankRevocationJobs(
  supabase: SupabaseClient,
  limit = 10,
): Promise<ClaimedBankRevocationJob[]> {
  const { data, error } = await supabase.rpc('claim_bank_revocation_jobs', {
    p_limit: limit,
    p_lease: '5 minutes',
  });
  if (error) throw new Error('bank revocation claim failed');
  if (!Array.isArray(data)) throw new Error('bank revocation claim returned an invalid response');

  const jobs: ClaimedBankRevocationJob[] = [];
  for (const row of data as ClaimedRow[]) {
    const attemptNumber = Number(row.attempt_number);
    if (
      !row.id ||
      !row.provider ||
      !row.operation_reason ||
      !row.claim_token ||
      !Number.isSafeInteger(attemptNumber) ||
      attemptNumber < 1
    ) {
      throw new Error('bank revocation claim contained a malformed job');
    }
    const reconciliationRequired = row.reconciliation_required === true;
    if (!reconciliationRequired && !row.encrypted_access_token) {
      throw new Error('bank revocation claim omitted its retry credential');
    }
    jobs.push({
      id: row.id,
      provider: row.provider,
      encryptedAccessToken: row.encrypted_access_token,
      connectionId: row.connection_id,
      operationReason: row.operation_reason,
      reconciliationRequired,
      claimToken: row.claim_token,
      attemptNumber,
    });
  }
  return jobs;
}

export async function resolveBankRevocationReconciliation(
  supabase: SupabaseClient,
  job: Pick<ClaimedBankRevocationJob, 'id' | 'claimToken'>,
): Promise<'ready' | 'reconciled' | 'retry' | 'lost_claim'> {
  const { data, error } = await supabase.rpc('resolve_bank_revocation_reconciliation', {
    p_id: job.id,
    p_claim_token: job.claimToken,
  });
  if (error) return 'retry';

  const status = typeof data === 'string' ? data : firstRow<string>(data);
  switch (status) {
    case 'ready':
    case 'reconciled':
    case 'retry':
    case 'lost_claim':
      return status;
    default:
      return 'retry';
  }
}

export async function completeBankRevocationJob(
  supabase: SupabaseClient,
  job: Pick<ClaimedBankRevocationJob, 'id' | 'claimToken'>,
  outcome: 'revoked' | 'already_invalid',
): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_bank_revocation_job', {
    p_id: job.id,
    p_claim_token: job.claimToken,
    p_provider_outcome: outcome,
  });
  if (error) return false;
  return data === true || firstRow<boolean>(data) === true;
}

export async function retryBankRevocationJob(
  supabase: SupabaseClient,
  job: Pick<ClaimedBankRevocationJob, 'id' | 'claimToken'>,
  errorCode: string,
): Promise<'retry_wait' | 'exhausted' | 'lost_claim'> {
  const { data, error } = await supabase.rpc('retry_bank_revocation_job', {
    p_id: job.id,
    p_claim_token: job.claimToken,
    p_error_code: errorCode,
  });
  if (error) return 'lost_claim';

  const row = firstRow<{ result_status?: string }>(data);
  switch (row?.result_status) {
    case 'retry_wait':
    case 'exhausted':
    case 'lost_claim':
      return row.result_status;
    default:
      return 'lost_claim';
  }
}

/** Convert safe helper detail into a bounded, non-sensitive durable code. */
export function safeBankRevocationErrorCode(detail: string | undefined): string {
  const known: Record<string, string> = {
    'no stored token': 'NO_STORED_CREDENTIAL',
    'provider revocation not implemented': 'PROVIDER_NOT_SUPPORTED',
    'provider credentials not configured': 'PROVIDER_CONFIG_MISSING',
    'encryption key not configured': 'ENCRYPTION_KEY_MISSING',
    'token decryption failed': 'TOKEN_DECRYPTION_FAILED',
    'stored credential malformed': 'STORED_CREDENTIAL_MALFORMED',
    'revocation request failed': 'PROVIDER_REQUEST_FAILED',
    'unexpected error': 'UNEXPECTED_ERROR',
  };
  if (!detail) return 'PROVIDER_REQUEST_FAILED';
  if (known[detail]) return known[detail];
  return /^[A-Z0-9_]{1,64}$/.test(detail) ? detail : 'UNCLASSIFIED_FAILURE';
}
