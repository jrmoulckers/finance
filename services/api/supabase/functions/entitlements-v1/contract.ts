// SPDX-License-Identifier: BUSL-1.1

/**
 * Minimized entitlement contract, version 1 (#4403).
 *
 * This module owns the *only* shape clients ever see of the Finance
 * entitlement projection. It is deliberately narrow: the wire contract
 * carries the logical tier, the lifecycle-derived access state, the
 * entitlement scope, the server-issued validity bound, the bank-connection
 * allowance, and the pending downgrade a client needs in order to prompt a
 * retention selection.
 *
 * It never carries provider names, provider customer/product/subscription/
 * transaction/receipt identifiers, raw provider evidence, credentials,
 * internal ledger row identifiers, other household members' billing data, or
 * any financial value.
 *
 * Authority: ADR-0027 (server-authoritative entitlements) and the
 * subscription entitlement catalog.
 *
 * @module
 */

/** Wire contract version. Bumped only for a breaking response change. */
export const ENTITLEMENT_CONTRACT_VERSION = 1;

/** Commercial catalog version this projection was derived against. */
export const ENTITLEMENT_CATALOG_VERSION = 1;

/** Effective logical tier a client may display. */
export type EntitlementTier = 'free' | 'plus' | 'premium' | 'family';

/** Tier the individual purchaser projection can carry. */
export type UserDisplayTier = 'free' | 'plus' | 'premium';

/** Tier a household projection can carry. */
export type HouseholdDisplayTier = 'free' | 'premium' | 'family';

/** Which subject the effective tier is derived from. */
export type EntitlementScope = 'user' | 'household';

/**
 * Lifecycle-derived access state.
 *
 * - `granted` — a verified paid grant is in effect at server time.
 * - `not_entitled` — Free applies; no current verified paid grant.
 * - `lapsed` — a projected paid tier whose server-issued validity bound has
 *   already passed. Explicitly non-authorizing; clients treat it as Free.
 */
export type EntitlementAccessState = 'granted' | 'not_entitled' | 'lapsed';

/**
 * The normalized provider lifecycle vocabulary ratified by ADR-0027 and the
 * catalog. Contract version 1 never discloses it — the minimized projection
 * intentionally does not distinguish `trialing` from `active` from
 * `cancelled_paid_through` — but the vocabulary is defined here so the shared
 * client contract and any future contract version stay aligned.
 */
export type EntitlementLifecycle =
  | 'trialing'
  | 'active'
  | 'cancelled_paid_through'
  | 'past_due_grace'
  | 'paused_paid_through'
  | 'expired'
  | 'refunded'
  | 'chargeback';

/** Stable machine-readable failure codes. Every one is non-authorizing. */
export type EntitlementErrorCode =
  | 'method_not_allowed'
  | 'unauthenticated'
  | 'invalid_request'
  | 'forbidden'
  | 'rate_limited'
  | 'projection_unavailable';

/** Row shape returned by `public.get_my_entitlements`. */
export interface EntitlementProjectionRow {
  user_display_tier: UserDisplayTier;
  household_display_tier: HouseholdDisplayTier | null;
  bank_connection_allowance: number;
  is_premium_sponsor: boolean;
  is_family_bound: boolean;
  effective_at: string;
  expires_at: string | null;
  projection_version: number;
  server_time: string;
}

/** Bank-connection capacity for the resolved household scope. */
export interface BankConnectionAllowance {
  /** Authoritative total connections the household may hold. */
  allowance: number;
  /** Catalog base for the effective household tier (Free 0, Premium 2, Family 4). */
  base_allowance: number;
  /** Allowance above the catalog base, i.e. verified add-on capacity. */
  addon_allowance: number;
}

/** Server-issued validity bound. Clients never substitute their own clock. */
export interface EntitlementValidity {
  effective_at: string;
  expires_at: string | null;
  server_time: string;
  projection_version: number;
}

/** Reduction that takes effect when the validity bound passes unrenewed. */
export interface PendingDowngrade {
  /** A reduction boundary exists at [effective_at]. */
  pending: boolean;
  /**
   * The earliest instant at which the current tier or allowance stops being
   * guaranteed. The projection's `expires_at` is already the earliest of the
   * purchaser bound, the household base bound, and any add-on bound, so it is
   * exactly that boundary.
   *
   * The contract deliberately does **not** state the allowance that applies
   * after this instant. The minimized projection carries no next-allowance,
   * and inferring one is wrong whenever a surviving grant keeps capacity —
   * an expiring add-on leaves the Premium base in place, and an expiring
   * Family purchase over a live Premium sponsorship leaves the sponsor's
   * allowance in place. Clients re-read the projection at or after this
   * instant instead.
   */
  effective_at: string | null;
}

/** The complete minimized entitlement a client receives. */
export interface MinimizedEntitlement {
  scope: EntitlementScope;
  tier: EntitlementTier;
  user_tier: UserDisplayTier;
  household_tier: HouseholdDisplayTier | null;
  access_state: EntitlementAccessState;
  lifecycle: EntitlementLifecycle | null;
  is_premium_sponsor: boolean;
  is_family_bound: boolean;
  bank_connections: BankConnectionAllowance;
  validity: EntitlementValidity;
  downgrade: PendingDowngrade;
}

/** Versioned response envelope. */
export interface EntitlementEnvelope {
  contract_version: number;
  catalog_version: number;
  entitlement: MinimizedEntitlement;
}

/** Catalog bank-connection base allowance per household tier. */
const HOUSEHOLD_BASE_ALLOWANCE: Record<HouseholdDisplayTier, number> = {
  free: 0,
  premium: 2,
  family: 4,
};

/** Catalog tier rank used to resolve the effective tier. */
const TIER_RANK: Record<EntitlementTier, number> = {
  free: 0,
  plus: 1,
  premium: 2,
  family: 3,
};

const USER_TIERS: readonly UserDisplayTier[] = ['free', 'plus', 'premium'];
const HOUSEHOLD_TIERS: readonly HouseholdDisplayTier[] = ['free', 'premium', 'family'];

/**
 * ISO 8601 instant with an explicit offset, as PostgREST renders
 * `TIMESTAMPTZ`. A value without an offset is ambiguous and is rejected.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function resolveEffectiveTier(
  userTier: UserDisplayTier,
  householdTier: HouseholdDisplayTier | null,
): { tier: EntitlementTier; scope: EntitlementScope } {
  const household: EntitlementTier = householdTier ?? 'free';
  // A household grant only takes over when it is strictly stronger than what
  // the purchaser already holds, so the reported scope names the subject that
  // actually produces the effective tier.
  return TIER_RANK[household] > TIER_RANK[userTier]
    ? { tier: household, scope: 'household' }
    : { tier: userTier, scope: 'user' };
}

/**
 * Strictly validate one `get_my_entitlements` row.
 *
 * Anything malformed, unknown, or internally inconsistent returns `null` so
 * the caller fails closed rather than authorizing from a partially understood
 * projection. `householdRequested` lets the check confirm the projection scope
 * matches the scope the server resolved, so a response can never silently
 * describe a different subject than the one the caller was authorized for.
 */
export function parseProjectionRow(
  value: unknown,
  householdRequested: boolean,
): EntitlementProjectionRow | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;

  const userTier = row.user_display_tier;
  const householdTier = row.household_display_tier;
  if (!USER_TIERS.includes(userTier as UserDisplayTier)) return null;
  if (householdTier !== null && !HOUSEHOLD_TIERS.includes(householdTier as HouseholdDisplayTier)) {
    return null;
  }
  // The household projection is present exactly when a household scope was
  // resolved for the authenticated caller.
  if (householdRequested !== (householdTier !== null)) return null;

  if (!isCount(row.bank_connection_allowance)) return null;
  if (typeof row.is_premium_sponsor !== 'boolean') return null;
  if (typeof row.is_family_bound !== 'boolean') return null;
  if (!isInstant(row.effective_at)) return null;
  if (row.expires_at !== null && !isInstant(row.expires_at)) return null;
  if (!isCount(row.projection_version) || row.projection_version < 1) return null;
  if (!isInstant(row.server_time)) return null;

  const allowance = row.bank_connection_allowance;
  const resolvedHouseholdTier = (householdTier as HouseholdDisplayTier | null) ?? null;

  // Catalog invariants. A projection that violates them is not understood and
  // must not authorize anything.
  if (resolvedHouseholdTier === null && allowance !== 0) return null;
  // Catalog version 1 fixes each household tier's capacity exactly: Free
  // carries none, Family carries four, and only Premium accrues verified
  // add-ons above its base of two.
  if (resolvedHouseholdTier === 'free' && allowance !== 0) return null;
  if (resolvedHouseholdTier === 'family' && allowance !== HOUSEHOLD_BASE_ALLOWANCE.family) {
    return null;
  }
  if (resolvedHouseholdTier === 'premium' && allowance < HOUSEHOLD_BASE_ALLOWANCE.premium) {
    return null;
  }
  if (!householdRequested && (row.is_premium_sponsor || row.is_family_bound)) return null;

  const effectiveTier = resolveEffectiveTier(
    userTier as UserDisplayTier,
    resolvedHouseholdTier,
  ).tier;
  // Every paid grant carries a trusted expiry; Free never does.
  if (effectiveTier !== 'free' && row.expires_at === null) return null;
  if (effectiveTier === 'free' && allowance > 0) return null;

  return {
    user_display_tier: userTier as UserDisplayTier,
    household_display_tier: resolvedHouseholdTier,
    bank_connection_allowance: allowance,
    is_premium_sponsor: row.is_premium_sponsor,
    is_family_bound: row.is_family_bound,
    effective_at: new Date(row.effective_at).toISOString(),
    expires_at: row.expires_at === null ? null : new Date(row.expires_at as string).toISOString(),
    projection_version: row.projection_version,
    server_time: new Date(row.server_time).toISOString(),
  };
}

/**
 * Project one validated row into the minimized client contract.
 *
 * The mapping is pure and total: it derives everything from the row plus the
 * ratified catalog constants, and never reaches back to provider evidence.
 */
export function toEnvelope(row: EntitlementProjectionRow): EntitlementEnvelope {
  const { tier, scope } = resolveEffectiveTier(row.user_display_tier, row.household_display_tier);
  const serverTimeMs = Date.parse(row.server_time);
  const expiresAtMs = row.expires_at === null ? null : Date.parse(row.expires_at);
  const withinValidity = expiresAtMs !== null && expiresAtMs > serverTimeMs;

  const accessState: EntitlementAccessState =
    tier === 'free' ? 'not_entitled' : withinValidity ? 'granted' : 'lapsed';

  const base =
    row.household_display_tier === null ? 0 : HOUSEHOLD_BASE_ALLOWANCE[row.household_display_tier];
  // Only Premium accrues verified add-ons in catalog version 1, so no other
  // tier can report capacity above its base.
  const addon =
    row.household_display_tier === 'premium'
      ? Math.max(0, row.bank_connection_allowance - base)
      : 0;
  const downgradePending = accessState === 'granted' && row.bank_connection_allowance > 0;

  return {
    contract_version: ENTITLEMENT_CONTRACT_VERSION,
    catalog_version: ENTITLEMENT_CATALOG_VERSION,
    entitlement: {
      scope,
      tier,
      user_tier: row.user_display_tier,
      household_tier: row.household_display_tier,
      access_state: accessState,
      // Contract version 1 does not disclose provider lifecycle detail.
      lifecycle: null,
      is_premium_sponsor: row.is_premium_sponsor,
      is_family_bound: row.is_family_bound,
      bank_connections: {
        allowance: row.bank_connection_allowance,
        base_allowance: base,
        addon_allowance: addon,
      },
      validity: {
        effective_at: row.effective_at,
        expires_at: row.expires_at,
        server_time: row.server_time,
        projection_version: row.projection_version,
      },
      downgrade: {
        pending: downgradePending,
        // The earliest instant the current capacity stops being guaranteed.
        // The allowance that survives it is not inferable from the minimized
        // projection and is deliberately not stated.
        effective_at: downgradePending ? row.expires_at : null,
      },
    },
  };
}
