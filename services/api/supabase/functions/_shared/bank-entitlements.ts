// SPDX-License-Identifier: BUSL-1.1

/**
 * Bank connection entitlements — tier-aware, concurrency-safe cap (#4404).
 *
 * WHY THIS EXISTS
 *
 * Every live bank connection is one aggregator "Item" (Plaid) or "member" (MX),
 * and both providers bill it as a **recurring monthly subscription for as long
 * as the Item exists** — not per API call. So the number of connections a
 * household may hold is an entitlement, and creating one past the allowance is a
 * recurring liability. See `docs/business/revenue/aggregator-cost-strategy.md`.
 *
 * THE ONE RULE (server-authoritative)
 *
 * The allowance is resolved entirely server-side by the database function
 * `bank_connection_cap_for_household(household_id)`, which reads only the
 * minimized Finance entitlement projection (`current_household_entitlements`,
 * Stage 5). That projection encodes the ratified contract and its non-stacking
 * rule: Free 0, Plus 0, Premium 2 plus only verified active add-on Items, and
 * Family 4 bound to its one household. Personal, sponsored-household, Family,
 * and add-on allowances never stack. This module never trusts a client tier,
 * feature flag, cached response, or requested cap.
 *
 * WHY A RESERVATION RATHER THAN COUNT-THEN-CREATE
 *
 * A billable Item is created at the provider BEFORE we can persist its row, so a
 * plain "count, then insert" races: two concurrent requests both see a free slot
 * and each create an Item. Instead the caller claims capacity atomically:
 *
 *   1. `reserveConnectionSlot` — the DB takes a per-household advisory lock,
 *      counts live rows plus unexpired reservations, and writes a short-lived
 *      reservation only if there is room. The provider exchange runs afterward.
 *   2. `finalizeConnectionReservation` — the DB retakes the lock, consumes the
 *      reservation, and inserts the connection row in one transaction.
 *
 * If the provider exchange fails, `releaseConnectionReservation` frees the slot
 * immediately. If finalization fails AFTER a billable Item exists, the caller
 * revokes the Item idempotently and, if revocation cannot be confirmed,
 * `recordOrphanedItem` durably retains the encrypted credential so Stage 7 can
 * retry revocation without losing the capability.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

/** Aggregator providers this module governs. */
export type BankProvider = 'plaid' | 'mx';

/**
 * Stable error codes surfaced to clients. The client owns upgrade presentation;
 * these codes and the accompanying messages never name a price and never carry
 * financial, provider, or household data.
 */
export type BankEntitlementErrorCode =
  'PREMIUM_REQUIRED' | 'CONNECTION_CAP_REACHED' | 'ENTITLEMENT_UNAVAILABLE';

/**
 * Default reservation lifetime. Long enough for a provider exchange, short
 * enough that an abandoned attempt frees the slot quickly.
 */
export const RESERVATION_TTL_SECONDS = 900;

/** Outcome of an atomic slot reservation. */
export type ReserveOutcome =
  | { status: 'reserved'; reservationId: string; cap: number; used: number; expiresAt: string }
  | { status: 'premium_required'; cap: number }
  | { status: 'at_cap'; cap: number; used: number }
  | { status: 'forbidden' }
  | { status: 'error'; message: string };

/** Outcome of consuming a reservation and inserting the connection row. */
export type FinalizeOutcome =
  | { status: 'finalized'; connectionId: string; createdAt: string }
  | { status: 'premium_required' }
  | { status: 'at_cap' }
  | { status: 'reservation_not_found' }
  | { status: 'error'; message: string };

interface ReserveRow {
  status: string;
  reservation_id: string | null;
  cap: number | string | null;
  used: number | string | null;
  expires_at: string | null;
}

interface FinalizeRow {
  status: string;
  connection_id: string | null;
  created_at: string | null;
}

interface CapacityRow {
  cap: number | string | null;
  used: number | string | null;
}

/** `count(*)`/`BIGINT` values arrive as strings over PostgREST; normalize. */
function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

function firstRow<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) return data[0] as T | undefined;
  return (data ?? undefined) as T | undefined;
}

/**
 * Atomically reserve one connection slot for a household.
 *
 * Fails closed: any RPC error resolves to `{ status: 'error' }` so the caller
 * rejects rather than creating an Item it cannot account for.
 */
export async function reserveConnectionSlot(
  supabase: SupabaseClient,
  params: { householdId: string; ownerId: string; provider: BankProvider; ttlSeconds?: number },
): Promise<ReserveOutcome> {
  const { data, error } = await supabase.rpc('reserve_bank_connection_slot', {
    p_household_id: params.householdId,
    p_owner_id: params.ownerId,
    p_provider: params.provider,
    p_ttl_seconds: params.ttlSeconds ?? RESERVATION_TTL_SECONDS,
  });

  if (error) {
    return { status: 'error', message: error.message };
  }

  const row = firstRow<ReserveRow>(data);
  if (!row) {
    return { status: 'error', message: 'empty reservation response' };
  }

  switch (row.status) {
    case 'reserved':
      if (!row.reservation_id || !row.expires_at) {
        return { status: 'error', message: 'malformed reservation response' };
      }
      return {
        status: 'reserved',
        reservationId: row.reservation_id,
        cap: toNumber(row.cap),
        used: toNumber(row.used),
        expiresAt: row.expires_at,
      };
    case 'premium_required':
      return { status: 'premium_required', cap: toNumber(row.cap) };
    case 'at_cap':
      return { status: 'at_cap', cap: toNumber(row.cap), used: toNumber(row.used) };
    case 'forbidden':
      return { status: 'forbidden' };
    default:
      return { status: 'error', message: `unexpected reservation status: ${row.status}` };
  }
}

/**
 * Consume a reservation and persist the connection row in one transaction.
 *
 * Any non-`finalized` outcome means the provider Item (if the exchange
 * succeeded) is now orphaned and the caller MUST revoke it.
 */
export async function finalizeConnectionReservation(
  supabase: SupabaseClient,
  params: {
    reservationId: string;
    householdId: string;
    ownerId: string;
    provider: BankProvider;
    institutionId: string;
    institutionName: string;
    encryptedAccessToken: string;
    metadata?: Record<string, unknown>;
  },
): Promise<FinalizeOutcome> {
  const { data, error } = await supabase.rpc('finalize_bank_connection_reservation', {
    p_reservation_id: params.reservationId,
    p_household_id: params.householdId,
    p_owner_id: params.ownerId,
    p_provider: params.provider,
    p_institution_id: params.institutionId,
    p_institution_name: params.institutionName,
    p_encrypted_access_token: params.encryptedAccessToken,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    return { status: 'error', message: error.message };
  }

  const row = firstRow<FinalizeRow>(data);
  if (!row) {
    return { status: 'error', message: 'empty finalization response' };
  }

  switch (row.status) {
    case 'finalized':
      if (!row.connection_id || !row.created_at) {
        return { status: 'error', message: 'malformed finalization response' };
      }
      return { status: 'finalized', connectionId: row.connection_id, createdAt: row.created_at };
    case 'premium_required':
      return { status: 'premium_required' };
    case 'at_cap':
      return { status: 'at_cap' };
    case 'reservation_not_found':
      return { status: 'reservation_not_found' };
    default:
      return { status: 'error', message: `unexpected finalization status: ${row.status}` };
  }
}

/**
 * Release an unconsumed reservation after a failed provider exchange so the slot
 * is freed immediately. Best-effort — never throws into the caller's error path.
 */
export async function releaseConnectionReservation(
  supabase: SupabaseClient,
  params: { reservationId: string; householdId: string },
): Promise<void> {
  try {
    await supabase.rpc('release_bank_connection_reservation', {
      p_reservation_id: params.reservationId,
      p_household_id: params.householdId,
    });
  } catch {
    // The reservation expires on its own; releasing is only an optimization.
  }
}

/**
 * Durably record a billable Item that could not be finalized and could not be
 * revoked immediately, retaining its encrypted credential for Stage 7 retry.
 *
 * Returns the handoff id, or `null` if the record could not be written (in which
 * case the caller has already attempted an immediate revoke and must surface the
 * failure rather than reporting success).
 */
export async function recordOrphanedItem(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    ownerId: string;
    provider: BankProvider;
    encryptedAccessToken: string;
    lastErrorCode?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await supabase.rpc('record_orphaned_bank_item', {
    p_household_id: params.householdId,
    p_owner_id: params.ownerId,
    p_provider: params.provider,
    p_encrypted_access_token: params.encryptedAccessToken,
    p_last_error_code: params.lastErrorCode ?? null,
  });

  if (error) return null;
  if (typeof data === 'string') return data;
  const row = firstRow<string>(data);
  return typeof row === 'string' ? row : null;
}

/**
 * Read-only cap + consumed snapshot for the non-authoritative link-token
 * pre-check. Fails closed: an RPC error resolves to `null`.
 */
export async function readConnectionCapacity(
  supabase: SupabaseClient,
  householdId: string,
): Promise<{ cap: number; used: number } | null> {
  const { data, error } = await supabase.rpc('bank_connection_capacity', {
    p_household_id: householdId,
  });
  if (error) return null;
  const row = firstRow<CapacityRow>(data);
  if (!row) return null;
  return { cap: toNumber(row.cap), used: toNumber(row.used) };
}

/**
 * User-facing message for a household that has exhausted its allowance.
 *
 * Deliberately states the limit and the remedy without naming a price — the
 * client owns upgrade presentation, and this string is also written to logs.
 */
export function connectionCapMessage(cap: number): string {
  return (
    `This household has reached its limit of ${cap} connected ${cap === 1 ? 'bank' : 'banks'}. ` +
    'Disconnect a bank before connecting another.'
  );
}

/**
 * User-facing message for a household with no bank connection allowance (Free or
 * Plus). Names no price; the client owns upgrade presentation.
 */
export function premiumRequiredMessage(): string {
  return 'Connecting a bank requires an eligible plan. Upgrade to connect your accounts.';
}
