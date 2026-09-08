// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export type DowngradeTargetTier = 'free' | 'plus' | 'premium';
export type RevocationOperation = 'downgrade' | 'user_disconnect';

export interface ClaimedBankRevocation {
  id: string;
  provider: string;
  encryptedAccessToken: string;
  claimToken: string;
  attempts: number;
}

interface DowngradeSelectionRow {
  selection_id: string | null;
  retained_count: number | string | null;
  target_allowance: number | string | null;
}

interface ClaimedRevocationRow {
  id: string | null;
  provider: string | null;
  encrypted_access_token: string | null;
  claim_token: string | null;
  attempts: number | string | null;
}

function firstRow<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) return data[0] as T | undefined;
  return (data ?? undefined) as T | undefined;
}

function numeric(value: number | string | null): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export async function prepareBankConnectionDowngrade(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    actorId: string;
    targetTier: DowngradeTargetTier;
    retainedConnectionIds: readonly string[];
  },
): Promise<
  | { status: 'prepared'; selectionId: string; retainedCount: number; targetAllowance: number }
  | { status: 'forbidden' }
  | { status: 'invalid' }
  | { status: 'unavailable' }
> {
  const { data, error } = await supabase.rpc('prepare_bank_connection_downgrade', {
    p_household_id: params.householdId,
    p_actor_id: params.actorId,
    p_target_tier: params.targetTier,
    p_retained_connection_ids: [...params.retainedConnectionIds],
  });

  if (error) {
    if (error.code === '42501') return { status: 'forbidden' };
    if (error.code === '22023') return { status: 'invalid' };
    return { status: 'unavailable' };
  }

  const row = firstRow<DowngradeSelectionRow>(data);
  if (!row?.selection_id) return { status: 'unavailable' };
  return {
    status: 'prepared',
    selectionId: row.selection_id,
    retainedCount: numeric(row.retained_count),
    targetAllowance: numeric(row.target_allowance),
  };
}

export async function enqueueBankConnectionRevocation(
  supabase: SupabaseClient,
  params: { connectionId: string; operation: RevocationOperation; actorId: string },
): Promise<'enqueued' | 'forbidden' | 'not_found' | 'unavailable'> {
  const { data, error } = await supabase.rpc('enqueue_bank_connection_revocation', {
    p_connection_id: params.connectionId,
    p_operation: params.operation,
    p_actor_id: params.actorId,
  });
  if (error) {
    if (error.code === '42501') return 'forbidden';
    return 'unavailable';
  }
  return typeof data === 'string' || firstRow<string>(data) ? 'enqueued' : 'not_found';
}

export async function prepareBankConnectionsForErasure(
  supabase: SupabaseClient,
  params: { ownerId: string; householdIds: readonly string[] },
): Promise<boolean> {
  const { error } = await supabase.rpc('prepare_bank_connection_erasure', {
    p_owner_id: params.ownerId,
    p_household_ids: params.householdIds.length > 0 ? [...params.householdIds] : null,
  });
  return !error;
}

export async function claimBankConnectionRevocations(
  supabase: SupabaseClient,
  limit: number,
): Promise<ClaimedBankRevocation[]> {
  const { data, error } = await supabase.rpc('claim_bank_connection_revocations', {
    p_limit: limit,
  });
  if (error) throw new Error('REVOCATION_CLAIM_FAILED');
  if (!Array.isArray(data)) return [];

  return (data as ClaimedRevocationRow[])
    .filter(
      (
        row,
      ): row is ClaimedRevocationRow & {
        id: string;
        provider: string;
        encrypted_access_token: string;
        claim_token: string;
      } =>
        typeof row.id === 'string' &&
        typeof row.provider === 'string' &&
        typeof row.encrypted_access_token === 'string' &&
        typeof row.claim_token === 'string',
    )
    .map((row) => ({
      id: row.id,
      provider: row.provider,
      encryptedAccessToken: row.encrypted_access_token,
      claimToken: row.claim_token,
      attempts: numeric(row.attempts),
    }));
}

export async function completeBankConnectionRevocation(
  supabase: SupabaseClient,
  params: { id: string; claimToken: string; outcome: 'revoked' | 'already_invalid' },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_bank_connection_revocation', {
    p_id: params.id,
    p_claim_token: params.claimToken,
    p_outcome: params.outcome,
  });
  if (error) return false;
  return data === true || firstRow<boolean>(data) === true;
}

export async function failBankConnectionRevocation(
  supabase: SupabaseClient,
  params: { id: string; claimToken: string; errorCode: string },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('fail_bank_connection_revocation', {
    p_id: params.id,
    p_claim_token: params.claimToken,
    p_error_code: params.errorCode,
  });
  return !error && Array.isArray(data) && data.length > 0;
}

export function safeRevocationErrorCode(detail: string | undefined): string {
  if (detail && /^[A-Z0-9_:-]{1,96}$/.test(detail)) return detail;
  switch (detail) {
    case 'provider credentials not configured':
      return 'PROVIDER_CONFIGURATION_MISSING';
    case 'encryption key not configured':
      return 'ENCRYPTION_CONFIGURATION_MISSING';
    case 'token decryption failed':
      return 'CREDENTIAL_DECRYPTION_FAILED';
    case 'stored credential malformed':
      return 'CREDENTIAL_MALFORMED';
    case 'provider revocation not implemented':
      return 'PROVIDER_ADAPTER_UNAVAILABLE';
    default:
      return 'PROVIDER_REVOCATION_FAILED';
  }
}
