// SPDX-License-Identifier: BUSL-1.1

/**
 * Bank connection entitlements — per-household aggregator Item cap (#4379).
 *
 * WHY THIS EXISTS
 *
 * Every live bank connection is one aggregator "Item" (Plaid) or "member" (MX),
 * and both providers bill it as a **recurring monthly subscription for as long
 * as the Item exists** — not per API call. So an unbounded number of connections
 * is an unbounded recurring liability, and `bank-connection` previously had no
 * cap of any kind: any authenticated user could create connections without
 * limit. See `docs/business/revenue/aggregator-cost-strategy.md`.
 *
 * WHY A FLAT CAP RATHER THAN A TIER GATE
 *
 * `docs/business/pricing/premium-strategy-conversion-funnel.md` documents bank
 * connections as a hard Premium gate, but there is **no server-side entitlement
 * record** to gate against — no per-user subscription/tier table exists, only
 * household-level `family_plan_subscriptions`. Until an entitlement source of
 * truth lands, this module enforces a single flat cap for every household. That
 * converts an unbounded liability into a bounded one without inventing an
 * entitlement model, and is deliberately the smaller half of #4379.
 *
 * When entitlements exist, `resolveConnectionCap` is the seam to change: return
 * 0 for free, `PREMIUM_CONNECTION_CAP` for Premium plus any purchased add-on
 * Items, and the family allowance for shared households. Nothing else moves.
 *
 * WHY SOFT-DELETED ROWS DO NOT COUNT
 *
 * Disconnecting revokes at the provider — Plaid `/item/remove`, MX member
 * delete (`_shared/bank-revocation.ts`) — which ends the subscription. A
 * soft-deleted row therefore carries no cost and must not consume allowance,
 * otherwise a user who disconnects a bank could never connect another.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

/**
 * Live connections allowed per household while no entitlement source of truth
 * exists. Two Items is the break-even ceiling: at the ~$0.30/Item/month
 * benchmark that is 15.5%–20.6% of net ARPU, and 3+ Items on mobile (30.9%)
 * is where aggregation stops paying for itself.
 */
export const PREMIUM_CONNECTION_CAP = 2;

/** The cap applied to every household today. See the module header. */
export const DEFAULT_CONNECTION_CAP = PREMIUM_CONNECTION_CAP;

/** Outcome of a cap check. `error` means the count could not be established. */
export type ConnectionCapCheck =
  | { status: 'allowed'; current: number; cap: number }
  | { status: 'at_cap'; current: number; cap: number }
  | { status: 'error'; message: string };

/**
 * Resolve the connection allowance for a household.
 *
 * Currently tier-blind by design — see the module header. Kept as a function so
 * the entitlement lookup has one obvious home when it is built.
 */
export function resolveConnectionCap(): number {
  return DEFAULT_CONNECTION_CAP;
}

/**
 * Count live connections for a household and compare against its allowance.
 *
 * Fails closed on a count error: the caller must reject rather than create an
 * Item it cannot account for.
 */
export async function checkConnectionCap(
  supabase: SupabaseClient,
  householdId: string,
  cap: number = resolveConnectionCap(),
): Promise<ConnectionCapCheck> {
  const { count, error } = await supabase
    .from('bank_connections')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .is('deleted_at', null);

  if (error) {
    return { status: 'error', message: error.message };
  }

  const current = count ?? 0;
  return current >= cap ? { status: 'at_cap', current, cap } : { status: 'allowed', current, cap };
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
