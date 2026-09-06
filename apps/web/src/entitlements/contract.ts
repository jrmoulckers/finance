// SPDX-License-Identifier: BUSL-1.1

/**
 * Web adapter for the shared KMP minimized entitlement contract.
 *
 * The Web build does not currently publish/link the KMP JS artifact, so these
 * wire-shaped types and checks intentionally mirror
 * packages/core/.../entitlement/MinimizedEntitlement.kt. Keep this adapter
 * mechanical: it must not allocate features or derive authorization.
 */

export const ENTITLEMENT_CONTRACT_VERSION = 1;
export const ENTITLEMENT_CATALOG_VERSION = 1;

export type EntitlementTier = 'free' | 'plus' | 'premium' | 'family';
export type EntitlementScope = 'user' | 'household';
export type EntitlementAccessState = 'granted' | 'not_entitled' | 'lapsed';
export type EntitlementLifecycle =
  | 'trialing'
  | 'active'
  | 'cancelled_paid_through'
  | 'past_due_grace'
  | 'paused_paid_through'
  | 'expired'
  | 'refunded'
  | 'chargeback';
export type DowngradeStatus = 'none' | 'scheduled' | 'undetermined';

export interface EntitlementEnvelope {
  readonly contract_version: number;
  readonly catalog_version: number;
  readonly entitlement: MinimizedEntitlement;
}

export interface MinimizedEntitlement {
  readonly scope: EntitlementScope;
  readonly tier: EntitlementTier;
  readonly user_tier: Exclude<EntitlementTier, 'family'>;
  readonly household_tier: Exclude<EntitlementTier, 'plus'> | null;
  readonly access_state: EntitlementAccessState;
  readonly lifecycle: EntitlementLifecycle | null;
  readonly is_premium_sponsor: boolean;
  readonly is_family_bound: boolean;
  readonly bank_connections: {
    readonly allowance: number;
    readonly base_allowance: number;
    readonly addon_allowance: number;
  };
  readonly validity: {
    readonly effective_at: string;
    readonly refresh_after: string | null;
    readonly server_time: string;
    readonly projection_version: number;
  };
  readonly downgrade: {
    readonly status: DowngradeStatus;
    readonly effective_at: string | null;
  };
}

export type EntitlementUnavailableReason =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid_request'
  | 'rate_limited'
  | 'projection_unavailable'
  | 'malformed'
  | 'unsupported_contract_version'
  | 'unsupported_catalog_version'
  | 'offline';

export type EntitlementResult =
  | { readonly available: true; readonly envelope: EntitlementEnvelope }
  | { readonly available: false; readonly reason: EntitlementUnavailableReason };

const TIERS = ['free', 'plus', 'premium', 'family'] as const;
const USER_TIERS = ['free', 'plus', 'premium'] as const;
const HOUSEHOLD_TIERS = ['free', 'premium', 'family'] as const;
const SCOPES = ['user', 'household'] as const;
const ACCESS_STATES = ['granted', 'not_entitled', 'lapsed'] as const;
const LIFECYCLES = [
  'trialing',
  'active',
  'cancelled_paid_through',
  'past_due_grace',
  'paused_paid_through',
  'expired',
  'refunded',
  'chargeback',
] as const;
const DOWNGRADE_STATES = ['none', 'scheduled', 'undetermined'] as const;

export function decodeEntitlement(value: unknown): EntitlementResult {
  const root = record(value);
  if (root.contract_version !== ENTITLEMENT_CONTRACT_VERSION) {
    return unavailable(
      typeof root.contract_version === 'number' ? 'unsupported_contract_version' : 'malformed',
    );
  }
  if (root.catalog_version !== ENTITLEMENT_CATALOG_VERSION) {
    return unavailable(
      typeof root.catalog_version === 'number' ? 'unsupported_catalog_version' : 'malformed',
    );
  }

  const raw = record(root.entitlement);
  const bank = record(raw.bank_connections);
  const validity = record(raw.validity);
  const downgrade = record(raw.downgrade);

  if (
    !member(raw.scope, SCOPES) ||
    !member(raw.tier, TIERS) ||
    !member(raw.user_tier, USER_TIERS) ||
    !(raw.household_tier === null || member(raw.household_tier, HOUSEHOLD_TIERS)) ||
    !member(raw.access_state, ACCESS_STATES) ||
    !(raw.lifecycle === null || member(raw.lifecycle, LIFECYCLES)) ||
    typeof raw.is_premium_sponsor !== 'boolean' ||
    typeof raw.is_family_bound !== 'boolean' ||
    !nonNegativeInteger(bank.allowance) ||
    !nonNegativeInteger(bank.base_allowance) ||
    !nonNegativeInteger(bank.addon_allowance) ||
    !isoInstant(validity.effective_at) ||
    !(validity.refresh_after === null || isoInstant(validity.refresh_after)) ||
    !isoInstant(validity.server_time) ||
    !positiveInteger(validity.projection_version) ||
    !member(downgrade.status, DOWNGRADE_STATES) ||
    !(downgrade.effective_at === null || isoInstant(downgrade.effective_at))
  ) {
    return unavailable('malformed');
  }

  const envelope = value as EntitlementEnvelope;
  return validateEntitlement(envelope);
}

export function validateEntitlement(envelope: EntitlementEnvelope): EntitlementResult {
  const entitlement = envelope.entitlement;
  if (
    envelope.contract_version !== ENTITLEMENT_CONTRACT_VERSION ||
    envelope.catalog_version !== ENTITLEMENT_CATALOG_VERSION
  ) {
    return unavailable(
      envelope.contract_version !== ENTITLEMENT_CONTRACT_VERSION
        ? 'unsupported_contract_version'
        : 'unsupported_catalog_version',
    );
  }

  const householdTier = entitlement.household_tier ?? 'free';
  const expectedTier =
    tierRank(householdTier) > tierRank(entitlement.user_tier)
      ? householdTier
      : entitlement.user_tier;
  const expectedScope =
    tierRank(householdTier) > tierRank(entitlement.user_tier) ? 'household' : 'user';
  const hasHousehold = entitlement.household_tier !== null;
  if (
    entitlement.tier !== expectedTier ||
    entitlement.scope !== expectedScope ||
    (!hasHousehold && (entitlement.is_premium_sponsor || entitlement.is_family_bound))
  ) {
    return unavailable('malformed');
  }

  const bank = entitlement.bank_connections;
  const expectedBase =
    entitlement.household_tier === 'premium' ? 2 : entitlement.household_tier === 'family' ? 4 : 0;
  if (
    bank.base_allowance !== expectedBase ||
    (expectedBase === 0 && (bank.allowance !== 0 || bank.addon_allowance !== 0)) ||
    (entitlement.household_tier === 'family' &&
      (bank.allowance !== 4 || bank.addon_allowance !== 0)) ||
    (entitlement.household_tier === 'premium' &&
      (bank.allowance < expectedBase ||
        bank.addon_allowance !== bank.allowance - bank.base_allowance))
  ) {
    return unavailable('malformed');
  }

  const refreshAfter = entitlement.validity.refresh_after;
  const serverTime = entitlement.validity.server_time;
  if (
    (entitlement.access_state === 'not_entitled' &&
      (entitlement.tier !== 'free' || refreshAfter !== null)) ||
    (entitlement.access_state === 'granted' &&
      (entitlement.tier === 'free' ||
        refreshAfter === null ||
        compareInstants(refreshAfter, serverTime) <= 0)) ||
    (entitlement.access_state === 'lapsed' &&
      (entitlement.tier === 'free' ||
        refreshAfter === null ||
        compareInstants(refreshAfter, serverTime) > 0))
  ) {
    return unavailable('malformed');
  }

  const contributingGrants =
    (entitlement.user_tier === 'free' ? 0 : 1) +
    (entitlement.household_tier === null || entitlement.household_tier === 'free' ? 0 : 1);
  const provable = contributingGrants <= 1;
  const scheduled = entitlement.downgrade;
  const granted = entitlement.access_state === 'granted';
  const validDowngrade =
    (scheduled.status === 'none' && !granted && scheduled.effective_at === null) ||
    (scheduled.status === 'scheduled' &&
      granted &&
      provable &&
      scheduled.effective_at !== null &&
      scheduled.effective_at === refreshAfter) ||
    (scheduled.status === 'undetermined' &&
      granted &&
      !provable &&
      scheduled.effective_at === null);
  return validDowngrade ? { available: true, envelope } : unavailable('malformed');
}

/**
 * Local time may request a refresh and may apply a server-proven reduction to
 * display. It never grants access or authorizes a server action.
 */
export function entitlementDisplay(
  envelope: EntitlementEnvelope,
  now: Date = new Date(),
): {
  readonly tier: EntitlementTier;
  readonly bankConnectionAllowance: number;
  readonly needsRefresh: boolean;
  readonly reductionEffective: boolean;
} {
  const validated = validateEntitlement(envelope);
  if (!validated.available) {
    return {
      tier: 'free',
      bankConnectionAllowance: 0,
      needsRefresh: false,
      reductionEffective: false,
    };
  }

  const timestamp = now.getTime();
  const refreshAfter = envelope.entitlement.validity.refresh_after;
  const reductionAt = envelope.entitlement.downgrade.effective_at;
  const granted = envelope.entitlement.access_state === 'granted';
  const reductionEffective =
    !granted || (reductionAt !== null && timestamp >= Date.parse(reductionAt));
  return {
    tier: reductionEffective ? 'free' : envelope.entitlement.tier,
    bankConnectionAllowance: reductionEffective
      ? 0
      : envelope.entitlement.bank_connections.allowance,
    needsRefresh: refreshAfter !== null && timestamp >= Date.parse(refreshAfter),
    reductionEffective,
  };
}

function unavailable(reason: EntitlementUnavailableReason): EntitlementResult {
  return { available: false, reason };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function member<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isoInstant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function compareInstants(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function tierRank(tier: EntitlementTier): number {
  switch (tier) {
    case 'free':
      return 0;
    case 'plus':
      return 1;
    case 'premium':
      return 2;
    case 'family':
      return 3;
  }
}
