// SPDX-License-Identifier: BUSL-1.1

/**
 * DeFi / locked-position engine for yield farmers (#2172).
 *
 * Tracks staked assets, liquidity-pool positions, lending positions, and
 * pending protocol rewards SEPARATELY from spot holdings, and:
 *
 *   - classifies each position as liquid or locked (in a contract);
 *   - computes liquid value, locked value, total exposure, and pending-reward
 *     value;
 *   - summarises exposure by protocol and by chain;
 *   - extracts staking / DeFi reward income for downstream income / tax
 *     classification (mapped onto the existing {@link StakingIncome} concept);
 *   - blends spot holdings with DeFi positions into one liquid-vs-locked split.
 *
 * Money is integer cents throughout. Percentages use banker's rounding (round
 * half to even) via the shared {@link bankersRound} helper. Every function is
 * pure — no side effects, no I/O, no market-data fetching.
 *
 * Modelling choices (documented for auditability):
 *   - A position's value is `principal + unclaimed rewards`. When a position is
 *     locked, its WHOLE value (including accrued rewards) is treated as locked,
 *     because staking rewards in a bonded position are typically not claimable
 *     until the lock / unbonding window resolves.
 *   - `pendingRewardValueCents` is reported on its own so callers can surface
 *     reward exposure regardless of the position's lock state.
 *   - Reward income is recognised at the supplied fair-market value; this engine
 *     never invents prices.
 *
 * References: issue #2172
 */

import { bankersRound, safeDivide } from './crypto-portfolio';
import type { LocalDate, StakingIncome } from './types';
import type {
  DefiChainSummary,
  DefiLiquidityBreakdown,
  DefiLiquidityClass,
  DefiLockState,
  DefiPortfolioSummary,
  DefiPositionEntry,
  DefiPositionKind,
  DefiPositionView,
  DefiProtocolSummary,
  PortfolioLiquiditySplit,
} from './defi-positions-types';

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Human-readable labels for each position kind. */
export const DEFI_KIND_LABELS: Readonly<Record<DefiPositionKind, string>> = {
  STAKING: 'Staking',
  LIQUIDITY_POOL: 'Liquidity pool',
  LENDING: 'Lending',
  BORROW: 'Borrow',
  VAULT: 'Vault',
  FARM: 'Yield farm',
};

/** Human-readable labels for each lock state. */
export const DEFI_LOCK_STATE_LABELS: Readonly<Record<DefiLockState, string>> = {
  LIQUID: 'Liquid',
  LOCKED: 'Locked',
  UNBONDING: 'Unbonding',
  WITHDRAWAL_PENDING: 'Withdrawal pending',
};

// ---------------------------------------------------------------------------
// Per-position helpers
// ---------------------------------------------------------------------------

/** Whether a lock state means the value is freely withdrawable. */
export function isLiquidLockState(state: DefiLockState): boolean {
  return state === 'LIQUID';
}

/** Classify a single position as liquid or locked. */
export function classifyLiquidity(position: DefiPositionEntry): DefiLiquidityClass {
  return isLiquidLockState(position.lockState) ? 'LIQUID' : 'LOCKED';
}

/** Sum the fiat value of a position's unclaimed rewards, in cents. */
export function rewardValueOfPosition(position: DefiPositionEntry): number {
  const rewards = position.rewards ?? [];
  let sum = 0;
  for (const reward of rewards) {
    sum += Number.isFinite(reward.valueCents) ? Math.round(reward.valueCents) : 0;
  }
  return sum;
}

/** Total current value of a position (principal + unclaimed rewards), in cents. */
export function positionTotalValueCents(position: DefiPositionEntry): number {
  const principal = Number.isFinite(position.principalValueCents)
    ? Math.round(position.principalValueCents)
    : 0;
  return principal + rewardValueOfPosition(position);
}

/** Enrich a raw position with computed value and classification fields. */
export function toPositionView(position: DefiPositionEntry): DefiPositionView {
  const rewardValueCents = rewardValueOfPosition(position);
  const principalValueCents = Number.isFinite(position.principalValueCents)
    ? Math.round(position.principalValueCents)
    : 0;
  return {
    id: position.id,
    protocol: position.protocol,
    chain: position.chain,
    kind: position.kind,
    kindLabel: DEFI_KIND_LABELS[position.kind] ?? position.kind,
    label: position.label,
    lockState: position.lockState,
    lockStateLabel: DEFI_LOCK_STATE_LABELS[position.lockState] ?? position.lockState,
    liquidityClass: classifyLiquidity(position),
    principalValueCents,
    rewardValueCents,
    totalValueCents: principalValueCents + rewardValueCents,
    apyPercent: position.apyPercent,
    unlockDate: position.unlockDate,
    rewards: position.rewards ?? [],
  };
}

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

/** A 2-decimal percent share of `part` within `whole` (banker's rounding). */
function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return bankersRound(safeDivide(part, whole) * 10000) / 100;
}

// ---------------------------------------------------------------------------
// Liquidity breakdown
// ---------------------------------------------------------------------------

/**
 * Split a set of positions into liquid vs locked value with a reward total.
 *
 * @param positions - The DeFi positions to summarise.
 * @returns Liquid / locked / reward totals plus liquid & locked percentages.
 */
export function computeLiquidityBreakdown(
  positions: readonly DefiPositionEntry[],
): DefiLiquidityBreakdown {
  let liquidValueCents = 0;
  let lockedValueCents = 0;
  let pendingRewardValueCents = 0;

  for (const position of positions) {
    const total = positionTotalValueCents(position);
    pendingRewardValueCents += rewardValueOfPosition(position);
    if (classifyLiquidity(position) === 'LIQUID') {
      liquidValueCents += total;
    } else {
      lockedValueCents += total;
    }
  }

  const totalExposureCents = liquidValueCents + lockedValueCents;

  return {
    liquidValueCents,
    lockedValueCents,
    pendingRewardValueCents,
    totalExposureCents,
    liquidPercent: percentOf(liquidValueCents, totalExposureCents),
    lockedPercent: percentOf(lockedValueCents, totalExposureCents),
  };
}

// ---------------------------------------------------------------------------
// Group summaries
// ---------------------------------------------------------------------------

interface MutableGroup {
  totalValueCents: number;
  liquidValueCents: number;
  lockedValueCents: number;
  pendingRewardValueCents: number;
  positionCount: number;
}

function emptyGroup(): MutableGroup {
  return {
    totalValueCents: 0,
    liquidValueCents: 0,
    lockedValueCents: 0,
    pendingRewardValueCents: 0,
    positionCount: 0,
  };
}

function accumulate(group: MutableGroup, position: DefiPositionEntry): void {
  const total = positionTotalValueCents(position);
  group.totalValueCents += total;
  group.pendingRewardValueCents += rewardValueOfPosition(position);
  group.positionCount += 1;
  if (classifyLiquidity(position) === 'LIQUID') {
    group.liquidValueCents += total;
  } else {
    group.lockedValueCents += total;
  }
}

/** Sort comparator: larger total first, then label ascending for stability. */
function byValueThenName<T extends { totalValueCents: number }>(
  nameOf: (item: T) => string,
): (a: T, b: T) => number {
  return (a, b) => b.totalValueCents - a.totalValueCents || nameOf(a).localeCompare(nameOf(b));
}

/** Summarise exposure grouped by protocol, ordered by total value descending. */
export function summarizeByProtocol(
  positions: readonly DefiPositionEntry[],
): readonly DefiProtocolSummary[] {
  const groups = new Map<string, MutableGroup>();
  const chains = new Map<string, Set<string>>();

  for (const position of positions) {
    const group = groups.get(position.protocol) ?? emptyGroup();
    accumulate(group, position);
    groups.set(position.protocol, group);

    const chainSet = chains.get(position.protocol) ?? new Set<string>();
    chainSet.add(position.chain);
    chains.set(position.protocol, chainSet);
  }

  return Array.from(groups.entries())
    .map(([protocol, group]) => ({
      protocol,
      totalValueCents: group.totalValueCents,
      liquidValueCents: group.liquidValueCents,
      lockedValueCents: group.lockedValueCents,
      pendingRewardValueCents: group.pendingRewardValueCents,
      positionCount: group.positionCount,
      chains: Array.from(chains.get(protocol) ?? new Set<string>()).sort(),
    }))
    .sort(byValueThenName((item) => item.protocol));
}

/** Summarise exposure grouped by chain, ordered by total value descending. */
export function summarizeByChain(
  positions: readonly DefiPositionEntry[],
): readonly DefiChainSummary[] {
  const groups = new Map<string, MutableGroup>();

  for (const position of positions) {
    const group = groups.get(position.chain) ?? emptyGroup();
    accumulate(group, position);
    groups.set(position.chain, group);
  }

  return Array.from(groups.entries())
    .map(([chain, group]) => ({
      chain,
      totalValueCents: group.totalValueCents,
      liquidValueCents: group.liquidValueCents,
      lockedValueCents: group.lockedValueCents,
      pendingRewardValueCents: group.pendingRewardValueCents,
      positionCount: group.positionCount,
    }))
    .sort(byValueThenName((item) => item.chain));
}

// ---------------------------------------------------------------------------
// Reward income → tax / income classification
// ---------------------------------------------------------------------------

/** Map a position kind onto its staking-income classification. */
function rewardIncomeType(kind: DefiPositionKind): StakingIncome['type'] {
  return kind === 'STAKING' ? 'STAKING' : 'DEFI_YIELD';
}

/**
 * Extract pending reward balances as {@link StakingIncome} records so they can
 * flow into the existing income / tax classification engines.
 *
 * Staking and DeFi rewards are ordinary income at fair-market value when the
 * holder gains dominion and control; this surfaces each accrued reward token as
 * one income record. Rewards with no quantity AND no value are skipped.
 *
 * @param positions - The DeFi positions to scan.
 * @param asOf - Fallback receipt date for positions without `valuationAsOf`.
 * @returns One {@link StakingIncome} record per non-empty reward balance.
 */
export function extractRewardIncome(
  positions: readonly DefiPositionEntry[],
  asOf?: LocalDate,
): readonly StakingIncome[] {
  const records: StakingIncome[] = [];

  for (const position of positions) {
    for (const reward of position.rewards ?? []) {
      const valueCents = Number.isFinite(reward.valueCents) ? Math.round(reward.valueCents) : 0;
      const quantity = Number.isFinite(reward.quantity) ? reward.quantity : 0;
      if (quantity === 0 && valueCents === 0) continue;

      records.push({
        id: `${position.id}:${reward.token}`,
        symbol: reward.token,
        quantity,
        fairMarketValueCents: valueCents,
        dateReceived: position.valuationAsOf ?? asOf ?? '',
        type: rewardIncomeType(position.kind),
        protocol: position.protocol,
      });
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Portfolio rollups
// ---------------------------------------------------------------------------

/**
 * Build the full DeFi portfolio summary: enriched positions, a liquid-vs-locked
 * breakdown, by-protocol and by-chain rollups, and reward-income records.
 *
 * @param positions - The DeFi positions to summarise.
 * @param options.rewardAsOf - Fallback date for reward income records.
 */
export function summarizeDefiPortfolio(
  positions: readonly DefiPositionEntry[],
  options: { readonly rewardAsOf?: LocalDate } = {},
): DefiPortfolioSummary {
  return {
    positions: positions.map(toPositionView),
    breakdown: computeLiquidityBreakdown(positions),
    byProtocol: summarizeByProtocol(positions),
    byChain: summarizeByChain(positions),
    rewardIncome: extractRewardIncome(positions, options.rewardAsOf),
    positionCount: positions.length,
  };
}

/**
 * Blend freely spendable spot holdings with a DeFi liquidity breakdown into a
 * single liquid-vs-locked split for the whole portfolio.
 *
 * Spot holdings are treated as liquid; DeFi locked value is the only locked
 * component. Percentages use banker's rounding over the combined total.
 *
 * @param spotLiquidValueCents - Market value of spot holdings, in cents.
 * @param breakdown - A DeFi liquidity breakdown (see {@link computeLiquidityBreakdown}).
 */
export function combinePortfolioLiquidity(
  spotLiquidValueCents: number,
  breakdown: DefiLiquidityBreakdown,
): PortfolioLiquiditySplit {
  const spot = Number.isFinite(spotLiquidValueCents) ? Math.round(spotLiquidValueCents) : 0;
  const liquidValueCents = spot + breakdown.liquidValueCents;
  const lockedValueCents = breakdown.lockedValueCents;
  const totalValueCents = liquidValueCents + lockedValueCents;

  return {
    spotLiquidValueCents: spot,
    defiLiquidValueCents: breakdown.liquidValueCents,
    defiLockedValueCents: breakdown.lockedValueCents,
    liquidValueCents,
    lockedValueCents,
    pendingRewardValueCents: breakdown.pendingRewardValueCents,
    totalValueCents,
    liquidPercent: percentOf(liquidValueCents, totalValueCents),
    lockedPercent: percentOf(lockedValueCents, totalValueCents),
  };
}
