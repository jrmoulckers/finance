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
 *
 * DEFINITE REJECTION vs UNKNOWN OUTCOME (remediation, Refs #4404)
 *
 * Revoking is destructive: it kills the provider Item. Doing that when the
 * connection row actually committed leaves the household with a live row whose
 * Item no longer exists. An RPC can commit and still lose its response, so an
 * error is NOT evidence that nothing was persisted.
 *
 * Finalization therefore takes a CALLER-GENERATED connection id and is
 * idempotent on it, and this module reports only two shapes:
 *
 *   - a DEFINITE outcome (`finalized`, `premium_required`, `at_cap`,
 *     `reservation_not_found`, `already_disconnected`) — the database answered;
 *   - `unknown` — no usable answer. The caller MUST resolve it with
 *     `confirmConnectionFinalization` (and may safely retry the same call,
 *     because it is keyed on the same connection id) and must NEVER revoke on
 *     an unknown outcome.
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

/**
 * Outcome of consuming a reservation and inserting the connection row.
 *
 * Every variant except `unknown` is DEFINITE — the database answered and the
 * caller may act on it, including revoking the provider Item. `unknown` means
 * the outcome was not observed; the caller must confirm it before revoking.
 */
export type FinalizeOutcome =
  | { status: 'finalized'; connectionId: string; createdAt: string }
  | { status: 'premium_required' }
  | { status: 'at_cap' }
  | { status: 'reservation_not_found' }
  | { status: 'already_disconnected' }
  | { status: 'account_deleting' }
  | { status: 'unknown'; message: string };

/** Definitive answer to "did this connection id commit?". */
export type FinalizationConfirmation =
  | { state: 'finalized'; createdAt: string }
  | { state: 'disconnected' }
  | { state: 'absent' }
  | { state: 'unknown' };

/** Open (credential-bearing) states of a durable orphan handoff. */
export type OrphanOpenStatus = 'pending_revocation' | 'pending_reconciliation';

/** Terminal (credential-free) states of a durable orphan handoff. */
export type OrphanTerminalStatus = 'revoked' | 'abandoned';

/** One open orphan handoff claimed for account-deletion erasure. */
export interface ClaimedOrphanedItem {
  id: string;
  provider: string;
  encryptedAccessToken: string | null;
  status: OrphanOpenStatus;
  connectionId: string | null;
}

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

interface FinalizationStateRow {
  state: string | null;
  created_at: string | null;
}

interface ClaimedOrphanRow {
  id: string | null;
  provider: string | null;
  encrypted_access_token: string | null;
  status: string | null;
  connection_id: string | null;
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
 * `connectionId` is generated by the CALLER and makes this call idempotent: if
 * a previous attempt with the same id committed but its response was lost,
 * replaying returns that committed row instead of inserting a second billable
 * connection.
 *
 * A DEFINITE non-`finalized` outcome means the provider Item (if the exchange
 * succeeded) is now orphaned and the caller MUST revoke it. An `unknown`
 * outcome means nothing of the sort is known — the caller must resolve it with
 * {@link confirmConnectionFinalization} and must NOT revoke until it has.
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
    connectionId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<FinalizeOutcome> {
  const { data, error } = await supabase.rpc('finalize_or_enqueue_bank_connection', {
    p_reservation_id: params.reservationId,
    p_household_id: params.householdId,
    p_owner_id: params.ownerId,
    p_provider: params.provider,
    p_institution_id: params.institutionId,
    p_institution_name: params.institutionName,
    p_encrypted_access_token: params.encryptedAccessToken,
    p_metadata: params.metadata ?? {},
    p_connection_id: params.connectionId,
  });

  // An RPC error is NOT proof that nothing committed — the transaction may have
  // succeeded and only the response lost. Report it as indeterminate.
  if (error) {
    return { status: 'unknown', message: error.message };
  }

  const row = firstRow<FinalizeRow>(data);
  if (!row) {
    return { status: 'unknown', message: 'empty finalization response' };
  }

  switch (row.status) {
    case 'finalized':
      if (!row.connection_id || !row.created_at) {
        return { status: 'unknown', message: 'malformed finalization response' };
      }
      return { status: 'finalized', connectionId: row.connection_id, createdAt: row.created_at };
    case 'premium_required':
      return { status: 'premium_required' };
    case 'at_cap':
      return { status: 'at_cap' };
    case 'reservation_not_found':
      return { status: 'reservation_not_found' };
    case 'already_disconnected':
      return { status: 'already_disconnected' };
    case 'account_deleting':
      return { status: 'account_deleting' };
    default:
      // An unrecognized status is not a rejection we can act on destructively.
      return { status: 'unknown', message: `unexpected finalization status: ${row.status}` };
  }
}

/**
 * Definitively resolve whether a caller-generated connection id committed.
 *
 * Fails closed to `unknown`: if the confirming read itself cannot be completed,
 * the caller still does not know the outcome and must not revoke.
 */
export async function confirmConnectionFinalization(
  supabase: SupabaseClient,
  params: { connectionId: string; householdId: string },
): Promise<FinalizationConfirmation> {
  const { data, error } = await supabase.rpc('bank_connection_finalization_state', {
    p_connection_id: params.connectionId,
    p_household_id: params.householdId,
  });

  if (error) return { state: 'unknown' };

  const row = firstRow<FinalizationStateRow>(data);
  if (!row) return { state: 'unknown' };

  switch (row.state) {
    case 'finalized':
      return row.created_at
        ? { state: 'finalized', createdAt: row.created_at }
        : { state: 'unknown' };
    case 'disconnected':
      return { state: 'disconnected' };
    case 'absent':
      return { state: 'absent' };
    default:
      return { state: 'unknown' };
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
 * Durably record a billable Item whose connection row is not in place, keeping
 * its encrypted credential so revocation remains possible.
 *
 * Two open statuses, and the difference matters:
 *   - `pending_revocation` — finalization is DEFINITELY absent. Revocation was
 *     already attempted and could not be confirmed; Stage 7 simply retries it.
 *   - `pending_reconciliation` — the outcome is UNKNOWN. Nothing may be revoked
 *     until `connectionId` is resolved against `bank_connections`, because the
 *     Item may already be backing a live connection.
 *
 * Returns the handoff id, or `null` if the record could not be written.
 */
export async function recordOrphanedItem(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    ownerId: string;
    provider: BankProvider;
    encryptedAccessToken: string;
    lastErrorCode?: string | null;
    status?: OrphanOpenStatus;
    connectionId?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await supabase.rpc('record_orphaned_bank_item', {
    p_household_id: params.householdId,
    p_owner_id: params.ownerId,
    p_provider: params.provider,
    p_encrypted_access_token: params.encryptedAccessToken,
    p_last_error_code: params.lastErrorCode ?? null,
    p_status: params.status ?? 'pending_revocation',
    p_connection_id: params.connectionId ?? null,
  });

  if (error) return null;
  if (typeof data === 'string') return data;
  const row = firstRow<string>(data);
  return typeof row === 'string' ? row : null;
}

/**
 * Move an open orphan handoff to a terminal state, destroying its stored
 * credential in the same database statement. Best-effort — never throws.
 */
export async function completeOrphanedItem(
  supabase: SupabaseClient,
  params: { id: string; status: OrphanTerminalStatus; lastErrorCode?: string | null },
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('complete_orphaned_bank_item', {
      p_id: params.id,
      p_status: params.status,
      p_last_error_code: params.lastErrorCode ?? null,
    });
    if (error) return false;
    return firstRow<boolean>(data) === true || data === true;
  } catch {
    return false;
  }
}

/**
 * Record a failed revocation attempt WITHOUT discarding the credential, which
 * is the only remaining way to revoke. Best-effort — never throws.
 */
export async function recordOrphanedItemAttempt(
  supabase: SupabaseClient,
  params: { id: string; lastErrorCode?: string | null },
): Promise<void> {
  try {
    await supabase.rpc('record_orphaned_bank_item_attempt', {
      p_id: params.id,
      p_last_error_code: params.lastErrorCode ?? null,
    });
  } catch {
    // Retention is still bounded by retain_until; the attempt count is advisory.
  }
}

/**
 * Claim a deleting account's open orphan handoffs so their provider Items can
 * be revoked before the account's own rows are removed (GDPR Art. 17 processor
 * propagation). Also shortens their retention window.
 *
 * Best-effort — resolves to an empty list rather than throwing, because account
 * deletion must never be blocked by the handoff table.
 */
export async function claimOrphanedItemsForErasure(
  supabase: SupabaseClient,
  params: { ownerId: string | null; householdIds?: readonly string[] },
): Promise<ClaimedOrphanedItem[]> {
  try {
    const householdIds = params.householdIds ?? [];
    const { data, error } = await supabase.rpc('claim_orphaned_bank_items_for_erasure', {
      p_owner_id: params.ownerId,
      p_household_ids: householdIds.length > 0 ? householdIds : null,
    });
    if (error || !Array.isArray(data)) return [];

    return (data as ClaimedOrphanRow[])
      .filter((row): row is ClaimedOrphanRow & { id: string } => typeof row?.id === 'string')
      .map((row) => ({
        id: row.id,
        provider: row.provider ?? '',
        encryptedAccessToken: row.encrypted_access_token,
        status:
          row.status === 'pending_reconciliation' ? 'pending_reconciliation' : 'pending_revocation',
        connectionId: row.connection_id,
      }));
  } catch {
    return [];
  }
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
